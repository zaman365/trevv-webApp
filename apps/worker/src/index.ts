import { pathToFileURL } from "node:url";
import {
  createDatabase,
  createWorkerRepositories,
  type AttentionRecomputeResult,
  type InternalEventResult,
  type WorkerLease,
  type WorkerQueueTelemetry,
  type WorkerRepositories,
} from "@founderhq/db";
import type { RuntimeReleaseMetadata } from "@founderhq/api-contract";
import {
  createWorkerHandlerRegistry,
  defaultWorkerHandlers,
  type WorkerHandlerRegistry,
} from "./handlers.js";
import {
  createWorkerHealthState,
  startWorkerHealthServer,
} from "./health-server.js";
import { readWorkerRuntimeConfiguration } from "./runtime-config.js";

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
  handlerRegistry: WorkerHandlerRegistry;
  workerId: string;
  enabled: boolean;
  batchSize: number;
  concurrency: number;
  leaseMs: number;
  maxAttempts: number;
  releaseMetadata?: RuntimeReleaseMetadata | null;
  organizationSweepLimit?: number;
  clock?: () => Date;
  random?: () => number;
  log?: (record: Record<string, unknown>) => void;
}

export interface WorkerRunResult {
  requestId: string;
  outbox: JobResult;
  attention: JobResult;
}

export interface WorkerLoopObserver {
  onSweepSucceeded?: (
    occurredAt: Date,
    result: WorkerRunResult,
    queue: WorkerQueueTelemetry,
  ) => void;
  onSweepFailed?: (occurredAt: Date) => void;
}

interface LeaseResult {
  processed: number;
  failed: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
  effects: number;
}

export async function runOutboxSweep(
  context: JobContext,
  dependencies: WorkerDependencies,
): Promise<JobResult> {
  const started = performance.now();
  if (
    !dependencies.enabled ||
    dependencies.handlerRegistry.activeEventTypes.length === 0
  )
    return emptyJobResult("outbox-sweep", started);

  const clock = dependencies.clock ?? (() => new Date());
  const concurrency = boundedInteger(
    dependencies.concurrency,
    1,
    10,
    "WORKER_CONCURRENCY",
  );
  const claimLimit = Math.min(
    boundedInteger(dependencies.batchSize, 1, 10, "WORKER_BATCH_SIZE"),
    concurrency,
  );
  const leases = await dependencies.repositories.outbox.lease({
    workerId: dependencies.workerId,
    now: clock(),
    leaseMs: dependencies.leaseMs,
    maxAttempts: dependencies.maxAttempts,
    limit: claimLimit,
    eventTypes: dependencies.handlerRegistry.activeEventTypes,
  });
  const results = await Promise.all(
    leases.map((lease) => processLease(context, dependencies, lease, clock)),
  );
  const totals = results.reduce<LeaseResult>(
    (total, result) => ({
      processed: total.processed + result.processed,
      failed: total.failed + result.failed,
      retried: total.retried + result.retried,
      deadLettered: total.deadLettered + result.deadLettered,
      leaseLost: total.leaseLost + result.leaseLost,
      effects: total.effects + result.effects,
    }),
    emptyLeaseResult(),
  );
  return {
    job: "outbox-sweep",
    ...totals,
    durationMs: Math.round(performance.now() - started),
  };
}

async function processLease(
  context: JobContext,
  dependencies: WorkerDependencies,
  lease: WorkerLease,
  clock: () => Date,
): Promise<LeaseResult> {
  const result = emptyLeaseResult();
  try {
    const handler = dependencies.handlerRegistry.resolve(lease.eventType);
    if (!handler) throw workerError("handler_unavailable");
    const processed = await dependencies.repositories.outbox.process(
      lease,
      (transaction) => handler.process(transaction, context.now),
    );
    if (processed.status === "lease_lost") {
      result.leaseLost = 1;
      return result;
    }
    result.processed = 1;
    result.effects = internalEffects(processed.value);
    return result;
  } catch (error) {
    result.failed = 1;
    const failedAt = clock();
    const disposition = await dependencies.repositories.outbox.fail(lease, {
      now: failedAt,
      nextAvailableAt: retryAvailableAt(
        failedAt,
        lease.attempt,
        dependencies.random ?? Math.random,
      ),
      errorCode: workerErrorCode(error),
      maxAttempts: dependencies.maxAttempts,
    });
    if (disposition === "retry_scheduled") result.retried = 1;
    else if (disposition === "dead_lettered") result.deadLettered = 1;
    else result.leaseLost = 1;
    return result;
  }
}

export async function runAttentionSweep(
  context: JobContext,
  dependencies: WorkerDependencies,
): Promise<JobResult> {
  const started = performance.now();
  if (
    !dependencies.enabled ||
    !dependencies.handlerRegistry.isActive("attention")
  )
    return emptyJobResult("attention-sweep", started);
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
    telemetryIntervalMs?: number;
    signal: AbortSignal;
    observer?: WorkerLoopObserver;
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
  const telemetryIntervalMs = boundedInteger(
    input.telemetryIntervalMs ?? 30_000,
    1_000,
    3_600_000,
    "WORKER_TELEMETRY_INTERVAL_MS",
  );
  const clock = dependencies.clock ?? (() => new Date());
  const log = dependencies.log ?? writeLog;
  const operational =
    dependencies.enabled &&
    dependencies.handlerRegistry.activeHandlers.length > 0;
  let announced = false;
  let nextAttentionSweepAt = Number.NEGATIVE_INFINITY;
  let nextTelemetryAt = Number.NEGATIVE_INFINITY;
  let lastQueue: WorkerQueueTelemetry | undefined;

  while (!input.signal.aborted) {
    const context = { now: clock(), requestId: crypto.randomUUID() };
    try {
      const outbox = await runOutboxSweep(context, dependencies);
      if (input.signal.aborted) return;
      const attentionDue = context.now.getTime() >= nextAttentionSweepAt;
      const attention = attentionDue
        ? await runAttentionSweep(context, dependencies)
        : emptyJobResult("attention-sweep");
      if (attentionDue)
        nextAttentionSweepAt = context.now.getTime() + attentionSweepIntervalMs;
      const result = { requestId: context.requestId, outbox, attention };
      const telemetryDue = context.now.getTime() >= nextTelemetryAt;
      if (telemetryDue) {
        lastQueue = await dependencies.repositories.outbox.telemetry({
          now: clock(),
          ownedEventTypes: dependencies.handlerRegistry.handlerEventTypes,
          activeEventTypes: operational
            ? dependencies.handlerRegistry.activeEventTypes
            : [],
        });
        nextTelemetryAt = context.now.getTime() + telemetryIntervalMs;
      }
      if (!lastQueue) throw workerError("queue_telemetry_unavailable");
      input.observer?.onSweepSucceeded?.(clock(), result, lastQueue);

      const wasAnnounced = announced;
      if (!announced) {
        announced = true;
        log({
          level: "info",
          service: "trevv-worker",
          event: operational ? "ready" : "paused",
          workerId: dependencies.workerId,
          activeHandlers: dependencies.handlerRegistry.activeHandlers.map(
            ({ name }) => name,
          ),
          disabledHandlers: dependencies.handlerRegistry.disabledHandlerNames,
          release: dependencies.releaseMetadata ?? null,
          result,
          queue: lastQueue,
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
          release: dependencies.releaseMetadata ?? null,
          result,
        });
      }
      if (telemetryDue && wasAnnounced)
        log({
          level: "info",
          service: "trevv-worker",
          event: "queue_snapshot",
          workerId: dependencies.workerId,
          release: dependencies.releaseMetadata ?? null,
          queue: lastQueue,
        });
    } catch (error) {
      const failedAt = clock();
      input.observer?.onSweepFailed?.(failedAt);
      log({
        level: "error",
        service: "trevv-worker",
        event: "sweep_failed",
        workerId: dependencies.workerId,
        release: dependencies.releaseMetadata ?? null,
        requestId: context.requestId,
        errorCode: workerErrorCode(error),
        retryInMs: pollIntervalMs,
      });
    }
    await waitForNextPoll(pollIntervalMs, input.signal);
  }
}

async function main(): Promise<void> {
  const configuration = readWorkerRuntimeConfiguration(
    process.env,
    defaultWorkerHandlers.map(({ name }) => name),
  );
  const handlerRegistry = createWorkerHandlerRegistry(
    defaultWorkerHandlers,
    configuration.disabledHandlerNames,
  );
  const connection = createDatabase(configuration.databaseUrl);
  const healthState = createWorkerHealthState({
    enabled: configuration.enabled,
    activeHandlerNames: handlerRegistry.activeHandlers.map(({ name }) => name),
    disabledHandlerNames: handlerRegistry.disabledHandlerNames,
    readinessMaxStalenessMs: configuration.readinessMaxStalenessMs,
    readinessMaxReadyAgeMs: configuration.readinessMaxReadyAgeMs,
    readinessMaxUnsupportedAgeMs: configuration.readinessMaxUnsupportedAgeMs,
    readinessMaxDeadLetters: configuration.readinessMaxDeadLetters,
    releaseMetadata: configuration.releaseMetadata,
  });
  const abortController = new AbortController();
  const stop = () => {
    healthState.beginShutdown();
    abortController.abort();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let healthServer:
    Awaited<ReturnType<typeof startWorkerHealthServer>> | undefined;
  try {
    healthServer = await startWorkerHealthServer({
      host: configuration.healthHost,
      port: configuration.healthPort,
      state: healthState,
    });
    writeLog({
      level: "info",
      service: "trevv-worker",
      event: "health_listening",
      origin: healthServer.origin,
      workerId: configuration.workerId,
      release: configuration.releaseMetadata,
    });
    await runWorkerLoop(
      {
        repositories: createWorkerRepositories(connection.db),
        handlerRegistry,
        workerId: configuration.workerId,
        enabled: configuration.enabled,
        batchSize: configuration.batchSize,
        concurrency: configuration.concurrency,
        leaseMs: configuration.leaseMs,
        maxAttempts: configuration.maxAttempts,
        releaseMetadata: configuration.releaseMetadata,
      },
      {
        pollIntervalMs: configuration.pollIntervalMs,
        attentionSweepIntervalMs: configuration.attentionSweepIntervalMs,
        telemetryIntervalMs: configuration.telemetryIntervalMs,
        signal: abortController.signal,
        observer: {
          onSweepSucceeded: (occurredAt, _result, queue) =>
            healthState.recordSuccessfulSweep(occurredAt, queue),
          onSweepFailed: (occurredAt) =>
            healthState.recordFailedSweep(occurredAt),
        },
      },
    );
  } finally {
    healthState.beginShutdown();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await Promise.all([healthServer?.close(), connection.close()]);
    writeLog({
      level: "info",
      service: "trevv-worker",
      event: "stopped",
      workerId: configuration.workerId,
      release: configuration.releaseMetadata,
    });
  }
}

function internalEffects(result: InternalEventResult): number {
  return (result.effects ?? 0) + attentionEffects(result.attention);
}

function attentionEffects(result?: AttentionRecomputeResult): number {
  return result
    ? result.created + result.refreshed + result.resolved + result.notifications
    : 0;
}

function emptyLeaseResult(): LeaseResult {
  return {
    processed: 0,
    failed: 0,
    retried: 0,
    deadLettered: 0,
    leaseLost: 0,
    effects: 0,
  };
}

function emptyJobResult(job: string, started?: number): JobResult {
  return {
    job,
    ...emptyLeaseResult(),
    durationMs:
      started === undefined ? 0 : Math.round(performance.now() - started),
  };
}

export function retryAvailableAt(
  now: Date,
  attempt: number,
  random: () => number,
): Date {
  const exponent = Math.max(0, Math.min(attempt - 1, 8));
  const capMs = Math.min(60_000 * 2 ** exponent, 3_600_000);
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1)
    throw new Error("Worker retry randomness must be between 0 and 1.");
  const delayMs = Math.floor(capMs * (0.5 + randomValue * 0.5));
  return new Date(now.getTime() + delayMs);
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

function workerError(code: string): Error {
  return Object.assign(new Error(code), { code });
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
    });
    process.exitCode = 1;
  });
