import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { WorkerQueueTelemetry } from "@founderhq/db";

export interface WorkerHealthStateOptions {
  enabled: boolean;
  activeHandlerNames: readonly string[];
  disabledHandlerNames: readonly string[];
  readinessMaxStalenessMs: number;
  readinessMaxUnsupportedAgeMs: number;
  clock?: () => Date;
}

export interface WorkerHealthSnapshot {
  status: "ready" | "not_ready";
  service: "trevv-worker";
  enabled: boolean;
  stopping: boolean;
  activeHandlers: readonly string[];
  disabledHandlers: readonly string[];
  lastSuccessfulSweepAt: string | null;
  lastFailedSweepAt: string | null;
  queue: WorkerQueueTelemetry | null;
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
      const unsupportedBacklogWithinGrace =
        queue !== null &&
        (queue.unsupported === 0 ||
          (effectiveOldestUnsupportedAgeMs !== null &&
            effectiveOldestUnsupportedAgeMs <
              options.readinessMaxUnsupportedAgeMs));
      const ready =
        options.enabled &&
        options.activeHandlerNames.length > 0 &&
        !stopping &&
        fresh &&
        unsupportedBacklogWithinGrace;
      return {
        status: ready ? "ready" : "not_ready",
        service: "trevv-worker",
        enabled: options.enabled,
        stopping,
        activeHandlers: [...options.activeHandlerNames],
        disabledHandlers: [...options.disabledHandlerNames],
        lastSuccessfulSweepAt: lastSuccessfulSweepAt?.toISOString() ?? null,
        lastFailedSweepAt: lastFailedSweepAt?.toISOString() ?? null,
        queue,
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
      writeJson(
        response,
        200,
        {
          status: snapshot.status,
          service: snapshot.service,
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
