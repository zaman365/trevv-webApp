import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { WorkerQueueTelemetry } from "@founderhq/db";
import type { RuntimeReleaseMetadata } from "@founderhq/api-contract";

export interface WorkerHealthStateOptions {
  enabled: boolean;
  activeHandlerNames: readonly string[];
  disabledHandlerNames: readonly string[];
  releaseMetadata?: RuntimeReleaseMetadata | null;
  readinessMaxStalenessMs: number;
  readinessMaxReadyAgeMs?: number;
  readinessMaxUnsupportedAgeMs: number;
  readinessMaxDeadLetters?: number;
  clock?: () => Date;
}

export interface WorkerHealthSnapshot {
  status: "ready" | "not_ready";
  service: "trevv-worker";
  release: RuntimeReleaseMetadata | null;
  enabled: boolean;
  stopping: boolean;
  activeHandlers: readonly string[];
  disabledHandlers: readonly string[];
  lastSuccessfulSweepAt: string | null;
  lastFailedSweepAt: string | null;
  queue: WorkerQueueTelemetry | null;
  checks: {
    sweepFresh: boolean;
    latestSweepSucceeded: boolean;
    readyBacklogWithinLimit: boolean;
    unsupportedBacklogWithinGrace: boolean;
    deadLettersWithinLimit: boolean;
  };
}

export interface WorkerHealthState {
  recordSuccessfulSweep: (
    occurredAt: Date,
    queue: WorkerQueueTelemetry,
  ) => void;
  recordFailedSweep: (occurredAt: Date) => void;
  beginShutdown: () => void;
  snapshot: () => WorkerHealthSnapshot;
}

export interface WorkerHealthServer {
  origin: string;
  close: () => Promise<void>;
}

export function createWorkerHealthState(
  options: WorkerHealthStateOptions,
): WorkerHealthState {
  const clock = options.clock ?? (() => new Date());
  let stopping = false;
  let lastSuccessfulSweepAt: Date | null = null;
  let lastFailedSweepAt: Date | null = null;
  let queue: WorkerQueueTelemetry | null = null;

  return {
    recordSuccessfulSweep(occurredAt, nextQueue) {
      lastSuccessfulSweepAt = occurredAt;
      queue = nextQueue;
    },
    recordFailedSweep(occurredAt) {
      lastFailedSweepAt = occurredAt;
    },
    beginShutdown() {
      stopping = true;
    },
    snapshot() {
      const now = clock();
      const fresh =
        lastSuccessfulSweepAt !== null &&
        now.getTime() - lastSuccessfulSweepAt.getTime() <=
          options.readinessMaxStalenessMs;
      const unsupportedObservationAgeMs = queue
        ? Math.max(0, now.getTime() - queue.observedAt.getTime())
        : 0;
      const effectiveOldestUnsupportedAgeMs =
        queue?.oldestUnsupportedAgeMs === null ||
        queue?.oldestUnsupportedAgeMs === undefined
          ? null
          : queue.oldestUnsupportedAgeMs + unsupportedObservationAgeMs;
      const effectiveOldestReadyAgeMs =
        queue?.oldestReadyAgeMs === null ||
        queue?.oldestReadyAgeMs === undefined
          ? null
          : queue.oldestReadyAgeMs + unsupportedObservationAgeMs;
      const effectiveQueue = queue
        ? {
            ...queue,
            oldestReadyAgeMs: effectiveOldestReadyAgeMs,
            oldestUnsupportedAgeMs: effectiveOldestUnsupportedAgeMs,
          }
        : null;
      const unsupportedBacklogWithinGrace =
        queue !== null &&
        (queue.unsupported === 0 ||
          (effectiveOldestUnsupportedAgeMs !== null &&
            effectiveOldestUnsupportedAgeMs <
              options.readinessMaxUnsupportedAgeMs));
      const readyBacklogWithinLimit =
        queue !== null &&
        (queue.ready === 0 ||
          (effectiveOldestReadyAgeMs !== null &&
            effectiveOldestReadyAgeMs <
              (options.readinessMaxReadyAgeMs ?? 300_000)));
      const deadLettersWithinLimit =
        queue !== null &&
        queue.deadLettered <= (options.readinessMaxDeadLetters ?? 0);
      const latestSweepSucceeded =
        lastFailedSweepAt === null ||
        (lastSuccessfulSweepAt !== null &&
          lastSuccessfulSweepAt.getTime() >= lastFailedSweepAt.getTime());
      const ready =
        options.enabled &&
        options.activeHandlerNames.length > 0 &&
        !stopping &&
        fresh &&
        latestSweepSucceeded &&
        readyBacklogWithinLimit &&
        unsupportedBacklogWithinGrace &&
        deadLettersWithinLimit;
      return {
        status: ready ? "ready" : "not_ready",
        service: "trevv-worker",
        release: options.releaseMetadata ?? null,
        enabled: options.enabled,
        stopping,
        activeHandlers: [...options.activeHandlerNames],
        disabledHandlers: [...options.disabledHandlerNames],
        lastSuccessfulSweepAt: lastSuccessfulSweepAt?.toISOString() ?? null,
        lastFailedSweepAt: lastFailedSweepAt?.toISOString() ?? null,
        queue: effectiveQueue,
        checks: {
          sweepFresh: fresh,
          latestSweepSucceeded,
          readyBacklogWithinLimit,
          unsupportedBacklogWithinGrace,
          deadLettersWithinLimit,
        },
      };
    },
  };
}

export async function startWorkerHealthServer(input: {
  host: string;
  port: number;
  state: WorkerHealthState;
}): Promise<WorkerHealthServer> {
  const server = createServer((request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (request.method !== "GET" && request.method !== "HEAD") {
      writeJson(
        response,
        405,
        { status: "method_not_allowed" },
        request.method,
      );
      return;
    }
    const path = new URL(request.url ?? "/", "http://worker.invalid").pathname;
    const snapshot = input.state.snapshot();
    if (path === "/livez") {
      writeJson(
        response,
        snapshot.stopping ? 503 : 200,
        {
          status: snapshot.stopping ? "stopping" : "ok",
          service: snapshot.service,
          release: snapshot.release,
        },
        request.method,
      );
      return;
    }
    if (path === "/readyz") {
      writeJson(
        response,
        snapshot.status === "ready" ? 200 : 503,
        snapshot,
        request.method,
      );
      return;
    }
    if (path === "/metrics") {
      response.setHeader(
        "content-type",
        "text/plain; version=0.0.4; charset=utf-8",
      );
      response.statusCode = 200;
      response.end(
        request.method === "HEAD" ? undefined : renderWorkerMetrics(snapshot),
      );
      return;
    }
    if (path === "/metrics.json") {
      writeJson(
        response,
        200,
        {
          status: snapshot.status,
          service: snapshot.service,
          release: snapshot.release,
          enabled: snapshot.enabled,
          stopping: snapshot.stopping,
          activeHandlers: snapshot.activeHandlers,
          disabledHandlers: snapshot.disabledHandlers,
          lastSuccessfulSweepAt: snapshot.lastSuccessfulSweepAt,
          lastFailedSweepAt: snapshot.lastFailedSweepAt,
          queue: snapshot.queue,
        },
        request.method,
      );
      return;
    }
    writeJson(response, 404, { status: "not_found" }, request.method);
  });
  await listen(server, input.port, input.host);
  const address = server.address() as AddressInfo;
  const host =
    address.family === "IPv6" ? `[${address.address}]` : address.address;
  return {
    origin: `http://${host}:${address.port}`,
    close: () => closeServer(server),
  };
}

export function renderWorkerMetrics(snapshot: WorkerHealthSnapshot): string {
  const queue = snapshot.queue;
  const lines = [
    "# HELP trevv_worker_up Worker process scrape health.",
    "# TYPE trevv_worker_up gauge",
    "trevv_worker_up 1",
    "# HELP trevv_worker_ready Worker readiness after dependency and queue checks.",
    "# TYPE trevv_worker_ready gauge",
    `trevv_worker_ready ${snapshot.status === "ready" ? 1 : 0}`,
    "# HELP trevv_worker_enabled Worker processing kill-switch state.",
    "# TYPE trevv_worker_enabled gauge",
    `trevv_worker_enabled ${snapshot.enabled ? 1 : 0}`,
    "# HELP trevv_worker_stopping Worker graceful shutdown state.",
    "# TYPE trevv_worker_stopping gauge",
    `trevv_worker_stopping ${snapshot.stopping ? 1 : 0}`,
    "# HELP trevv_worker_queue_events Durable outbox events by current state.",
    "# TYPE trevv_worker_queue_events gauge",
  ];
  for (const [state, value] of [
    ["ready", queue?.ready ?? 0],
    ["delayed", queue?.delayed ?? 0],
    ["leased", queue?.leased ?? 0],
    ["dead_lettered", queue?.deadLettered ?? 0],
    ["paused", queue?.paused ?? 0],
    ["unsupported", queue?.unsupported ?? 0],
  ] as const)
    lines.push(`trevv_worker_queue_events{state="${state}"} ${value}`);
  lines.push(
    "# HELP trevv_worker_queue_oldest_ready_age_seconds Age of the oldest ready outbox event.",
    "# TYPE trevv_worker_queue_oldest_ready_age_seconds gauge",
    `trevv_worker_queue_oldest_ready_age_seconds ${(queue?.oldestReadyAgeMs ?? 0) / 1_000}`,
    "# HELP trevv_worker_queue_oldest_unsupported_age_seconds Age of the oldest unsupported outbox event.",
    "# TYPE trevv_worker_queue_oldest_unsupported_age_seconds gauge",
    `trevv_worker_queue_oldest_unsupported_age_seconds ${(queue?.oldestUnsupportedAgeMs ?? 0) / 1_000}`,
    "# HELP trevv_worker_attempts Durable attempt records by current outcome.",
    "# TYPE trevv_worker_attempts gauge",
  );
  for (const [outcome, value] of [
    ["leased", queue?.attempts.leased ?? 0],
    ["succeeded", queue?.attempts.succeeded ?? 0],
    ["failed", queue?.attempts.failed ?? 0],
    ["dead_lettered", queue?.attempts.deadLettered ?? 0],
  ] as const)
    lines.push(`trevv_worker_attempts{outcome="${outcome}"} ${value}`);
  return `${lines.join("\n")}\n`;
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  method: string | undefined,
): void {
  response.statusCode = status;
  response.end(method === "HEAD" ? undefined : JSON.stringify(body));
}

async function listen(
  server: Server,
  port: number,
  host: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
