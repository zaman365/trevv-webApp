import { describe, expect, it } from "vitest";
import type {
  AttentionRecomputeResult,
  WorkerLease,
  WorkerRepositories,
  WorkerTransactionRepositories,
} from "@founderhq/db";
import { runOutboxSweep, runWorkerLoop, runWorkerOnce } from "./index";

const now = new Date("2026-08-29T10:00:00.000Z");

function lease(attempt = 1): WorkerLease {
  return {
    eventId: "event-1",
    organizationId: "org-1",
    eventType: "item.updated",
    aggregateType: "work_item",
    aggregateId: "item-1",
    payload: {},
    attempt,
    workerId: "phase3-test-worker",
    leaseToken: "lease-token",
    leaseExpiresAt: new Date("2026-08-29T10:01:00.000Z"),
    createdAt: new Date("2026-08-29T09:59:00.000Z"),
  };
}

function dependencies(repositories: WorkerRepositories) {
  return {
    repositories,
    workerId: "phase3-test-worker",
    batchSize: 10,
    leaseMs: 30_000,
    maxAttempts: 3,
  };
}

function fakeRepositories(input?: {
  processError?: Error;
  disposition?: "retry_scheduled" | "dead_lettered" | "lease_lost";
  attention?: AttentionRecomputeResult;
  attempt?: number;
  onFail?: (nextAvailableAt: Date) => void;
}): WorkerRepositories {
  const leased = lease(input?.attempt);
  const attention = input?.attention ?? {
    organizationId: "org-1",
    created: 1,
    refreshed: 0,
    resolved: 0,
    notifications: 1,
  };
  const transaction: WorkerTransactionRepositories = {
    event: leased,
    processInternalEvent: async () => ({ recomputed: true, attention }),
    attention: { recomputeOrganization: async () => attention },
  };
  return {
    outbox: {
      lease: async () => [leased],
      process: async <T>(
        _lease: WorkerLease,
        handler: (repositories: WorkerTransactionRepositories) => Promise<T>,
      ) => {
        if (input?.processError) throw input.processError;
        return {
          status: "processed" as const,
          value: await handler(transaction),
        };
      },
      fail: async (_lease, failure) => {
        input?.onFail?.(failure.nextAvailableAt);
        return input?.disposition ?? "retry_scheduled";
      },
    },
    attention: {
      recomputeOrganization: async () => attention,
      recomputeAll: async () => [attention],
    },
  };
}

describe("PostgreSQL worker orchestration", () => {
  it("runs one bounded pass and reports durable internal effects", async () => {
    const result = await runWorkerOnce(
      { now, requestId: "request-1" },
      dependencies(fakeRepositories()),
    );
    expect(result.requestId).toBe("request-1");
    expect(result.outbox).toMatchObject({
      processed: 1,
      failed: 0,
      effects: 2,
    });
    expect(result.attention).toMatchObject({ processed: 1, effects: 2 });
  });

  it("schedules deterministic exponential retry after a rolled-back handler", async () => {
    let nextAvailableAt: Date | undefined;
    const repositories = fakeRepositories({
      processError: new Error("transient"),
      disposition: "retry_scheduled",
      attempt: 2,
      onFail: (value) => {
        nextAvailableAt = value;
      },
    });
    const result = await runOutboxSweep(
      { now, requestId: "request-retry" },
      dependencies(repositories),
    );
    expect(result).toMatchObject({
      processed: 0,
      failed: 1,
      retried: 1,
      deadLettered: 0,
    });
    expect(nextAvailableAt?.toISOString()).toBe("2026-08-29T10:02:00.000Z");
  });

  it("reports the repository's terminal dead-letter decision", async () => {
    const result = await runOutboxSweep(
      { now, requestId: "request-dead" },
      dependencies(
        fakeRepositories({
          processError: new Error("permanent"),
          disposition: "dead_lettered",
          attempt: 3,
        }),
      ),
    );
    expect(result).toMatchObject({
      failed: 1,
      retried: 0,
      deadLettered: 1,
    });
  });

  it("recovers the continuous loop after a sweep-level repository failure", async () => {
    const abortController = new AbortController();
    const repositories = fakeRepositories();
    const records: Array<Record<string, unknown>> = [];
    let leaseCalls = 0;
    repositories.outbox.lease = async () => {
      leaseCalls += 1;
      if (leaseCalls === 1) throw new Error("database temporarily unavailable");
      abortController.abort();
      return [];
    };
    repositories.attention.recomputeAll = async () => [];

    await expect(
      runWorkerLoop(
        {
          ...dependencies(repositories),
          log: (record) => records.push(record),
        },
        {
          pollIntervalMs: 100,
          attentionSweepIntervalMs: 1_000,
          signal: abortController.signal,
        },
      ),
    ).resolves.toBeUndefined();

    expect(leaseCalls).toBe(2);
    expect(records.map(({ event }) => event)).toEqual([
      "sweep_failed",
      "ready",
    ]);
  });
});
