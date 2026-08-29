import { pathToFileURL } from "node:url";
import {
  createDatabase,
  createWorkerRepositories,
  type AttentionRecomputeResult,
  type WorkerLease,
  type WorkerRepositories,
} from "@founderhq/db";

export interface JobContext {
  now: Date;
  requestId: string;
}

export interface JobResult {
  job: string;
  processed: number;
  failed: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
  effects: number;
  durationMs: number;
}

export interface WorkerDependencies {
  repositories: WorkerRepositories;
  workerId: string;
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
  organizationSweepLimit?: number;
  clock?: () => Date;
  log?: (record: Record<string, unknown>) => void;
}

export interface WorkerRunResult {
  requestId: string;
  outbox: JobResult;
  attention: JobResult;
}

export async function runOutboxSweep(
  context: JobContext,
  dependencies: WorkerDependencies,
): Promise<JobResult> {
  const started = performance.now();
  const clock = dependencies.clock ?? (() => context.now);
  const leaseNow = clock();
  const leases = await dependencies.repositories.outbox.lease({
    workerId: dependencies.workerId,
    now: leaseNow,
    leaseMs: dependencies.leaseMs,
    limit: dependencies.batchSize,
  });
  let processed = 0;
  let failed = 0;
  let retried = 0;
  let deadLettered = 0;
  let leaseLost = 0;
  let effects = 0;
  for (const lease of leases) {
    try {
      const result = await dependencies.repositories.outbox.process(
        lease,
        (transaction) => transaction.processInternalEvent(context.now),
      );
      if (result.status === "lease_lost") {
        leaseLost += 1;
        continue;
      }
      processed += 1;
      effects += attentionEffects(result.value.attention);
    } catch (error) {
      failed += 1;
      const failedAt = clock();
      const disposition = await dependencies.repositories.outbox.fail(lease, {
        now: failedAt,
        nextAvailableAt: retryAt(failedAt, lease),
        errorCode: workerErrorCode(error),
        maxAttempts: dependencies.maxAttempts,
      });
      if (disposition === "retry_scheduled") retried += 1;
      else if (disposition === "dead_lettered") deadLettered += 1;
      else leaseLost += 1;
    }
  }
  return {
    job: "outbox-sweep",
    processed,
    failed,
    retried,
    deadLettered,
    leaseLost,
    effects,
    durationMs: Math.round(performance.now() - started),
  };
}

export async function runAttentionSweep(
  context: JobContext,
  dependencies: WorkerDependencies,
): Promise<JobResult> {
  const started = performance.now();
  const results = await dependencies.repositories.attention.recomputeAll(
    context.now,
    dependencies.organizationSweepLimit ?? 100,
  );
  return {
    job: "attention-sweep",
    processed: results.length,
    failed: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
    effects: results.reduce(
      (total, result) => total + attentionEffects(result),
      0,
    ),
    durationMs: Math.round(performance.now() - started),
  };
}

export async function runWorkerOnce(
  context: JobContext,
  dependencies: WorkerDependencies,
): Promise<WorkerRunResult> {
  const outbox = await runOutboxSweep(context, dependencies);
  const attention = await runAttentionSweep(context, dependencies);
  return { requestId: context.requestId, outbox, attention };
}

export async function runWorkerLoop(
  dependencies: WorkerDependencies,
  input: {
    pollIntervalMs: number;
    attentionSweepIntervalMs?: number;
    signal: AbortSignal;
  },
): Promise<void> {
  const pollIntervalMs = boundedInteger(
    input.pollIntervalMs,
    100,
    60_000,
    "WORKER_POLL_INTERVAL_MS",
  );
  const attentionSweepIntervalMs = boundedInteger(
    input.attentionSweepIntervalMs ?? 60_000,
    1_000,
    3_600_000,
    "WORKER_ATTENTION_SWEEP_INTERVAL_MS",
  );
  let ready = false;
  let nextAttentionSweepAt = Number.NEGATIVE_INFINITY;
  while (!input.signal.aborted) {
    const context = { now: new Date(), requestId: crypto.randomUUID() };
    const log = dependencies.log ?? writeLog;
    try {
      const outbox = await runOutboxSweep(context, dependencies);
      const attentionDue = context.now.getTime() >= nextAttentionSweepAt;
      const attention = attentionDue
        ? await runAttentionSweep(context, dependencies)
        : emptyJobResult("attention-sweep");
      if (attentionDue)
        nextAttentionSweepAt = context.now.getTime() + attentionSweepIntervalMs;
      const result = { requestId: context.requestId, outbox, attention };
      if (!ready) {
        ready = true;
        log({
          level: "info",
          service: "trevv-worker",
          event: "ready",
          workerId: dependencies.workerId,
          result,
        });
      } else if (
        result.outbox.processed > 0 ||
        result.outbox.failed > 0 ||
        result.attention.effects > 0
      ) {
        log({
          level: "info",
          service: "trevv-worker",
          event: "sweep_completed",
          workerId: dependencies.workerId,
          result,
        });
      }
    } catch (error) {
      log({
        level: "error",
        service: "trevv-worker",
        event: "sweep_failed",
        workerId: dependencies.workerId,
        requestId: context.requestId,
        errorCode: workerErrorCode(error),
        retryInMs: pollIntervalMs,
      });
    }
    await waitForNextPoll(pollIntervalMs, input.signal);
  }
}

interface WorkerEnvironment {
  databaseUrl: string;
  workerId: string;
  pollIntervalMs: number;
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
  attentionSweepIntervalMs: number;
}

function readWorkerEnvironment(
  environment: NodeJS.ProcessEnv,
): WorkerEnvironment {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const workerId = normalizeWorkerId(environment.WORKER_ID ?? "");
  return {
    databaseUrl,
    workerId,
    pollIntervalMs: environmentInteger(
      environment.WORKER_POLL_INTERVAL_MS,
      1_000,
      100,
      60_000,
      "WORKER_POLL_INTERVAL_MS",
    ),
    batchSize: environmentInteger(
      environment.WORKER_BATCH_SIZE,
      25,
      1,
      100,
      "WORKER_BATCH_SIZE",
    ),
    leaseMs: environmentInteger(
      environment.WORKER_LEASE_MS,
      30_000,
      1_000,
      300_000,
      "WORKER_LEASE_MS",
    ),
    maxAttempts: environmentInteger(
      environment.WORKER_MAX_ATTEMPTS,
      8,
      1,
      50,
      "WORKER_MAX_ATTEMPTS",
    ),
    attentionSweepIntervalMs: environmentInteger(
      environment.WORKER_ATTENTION_SWEEP_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
      "WORKER_ATTENTION_SWEEP_INTERVAL_MS",
    ),
  };
}

async function main(): Promise<void> {
  const environment = readWorkerEnvironment(process.env);
  const connection = createDatabase(environment.databaseUrl);
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await runWorkerLoop(
      {
        repositories: createWorkerRepositories(connection.db),
        workerId: environment.workerId,
        batchSize: environment.batchSize,
        leaseMs: environment.leaseMs,
        maxAttempts: environment.maxAttempts,
      },
      {
        pollIntervalMs: environment.pollIntervalMs,
        attentionSweepIntervalMs: environment.attentionSweepIntervalMs,
        signal: abortController.signal,
      },
    );
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await connection.close();
    writeLog({
      level: "info",
      service: "trevv-worker",
      event: "stopped",
      workerId: environment.workerId,
    });
  }
}

function attentionEffects(result?: AttentionRecomputeResult): number {
  return result
    ? result.created + result.refreshed + result.resolved + result.notifications
    : 0;
}

function emptyJobResult(job: string): JobResult {
  return {
    job,
    processed: 0,
    failed: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
    effects: 0,
    durationMs: 0,
  };
}

function retryAt(now: Date, lease: WorkerLease): Date {
  const exponent = Math.max(0, Math.min(lease.attempt - 1, 8));
  return new Date(now.getTime() + Math.min(60_000 * 2 ** exponent, 3_600_000));
}

function workerErrorCode(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(error.code)
  )
    return error.code;
  return "internal_error";
}

function normalizeWorkerId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/iu.test(normalized))
    throw new Error("WORKER_ID must be 3-128 URL-safe characters.");
  return normalized;
}

function environmentInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  return boundedInteger(Number(value), minimum, maximum, label);
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  return value;
}

async function waitForNextPoll(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function writeLog(record: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

const isExecutable =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutable)
  main().catch((error: unknown) => {
    writeLog({
      level: "error",
      service: "trevv-worker",
      event: "fatal",
      errorCode: workerErrorCode(error),
      message: error instanceof Error ? error.message : "Unknown worker error",
    });
    process.exitCode = 1;
  });
