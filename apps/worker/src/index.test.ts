import { describe, expect, it } from "vitest";
import type {
  AttentionRecomputeResult,
  WorkerLease,
  WorkerQueueTelemetry,
  WorkerRepositories,
  WorkerTransactionRepositories,
} from "@founderhq/db";
import { createWorkerHandlerRegistry, defaultWorkerHandlers } from "./handlers";
import {
  retryAvailableAt,
  runOutboxSweep,
  runWorkerLoop,
  runWorkerOnce,
  type WorkerDependencies,
} from "./index";

const now = new Date("2026-08-29T10:00:00.000Z");

function lease(attempt = 1, eventId = "event-1"): WorkerLease {
  return {
    eventId,
    organizationId: "org-1",
    eventType: "item.updated",
    aggregateType: "work_item",
    aggregateId: "item-1",
    payload: {},
    attempt,
    workerId: "phase4-test-worker",
    leaseToken: `lease-token-${eventId}`,
    leaseExpiresAt: new Date("2026-08-29T10:01:00.000Z"),
    createdAt: new Date("2026-08-29T09:59:00.000Z"),
  };
}

function queueTelemetry(observedAt = now): WorkerQueueTelemetry {
  return {
    observedAt,
    ready: 0,
    delayed: 0,
    leased: 0,
    deadLettered: 0,
    paused: 0,
    unsupported: 0,
    oldestReadyAgeMs: null,
    oldestUnsupportedAgeMs: null,
    attempts: { leased: 0, succeeded: 0, failed: 0, deadLettered: 0 },
  };
}

function dependencies(
  repositories: WorkerRepositories,
  overrides: Partial<WorkerDependencies> = {},
): WorkerDependencies {
  return {
    repositories,
    handlerRegistry: createWorkerHandlerRegistry(),
    workerId: "phase4-test-worker",
    enabled: true,
    batchSize: 5,
    concurrency: 5,
    leaseMs: 30_000,
    maxAttempts: 3,
    random: () => 0,
    ...overrides,
  };
}

function fakeRepositories(input?: {
  processError?: Error;
  disposition?: "retry_scheduled" | "dead_lettered" | "lease_lost";
  attention?: AttentionRecomputeResult;
  attempt?: number;
  onFail?: (failure: { now: Date; nextAvailableAt: Date }) => void;
  onLease?: (input: {
    limit: number;
    maxAttempts: number;
    eventTypes?: readonly string[];
  }) => void;
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
      lease: async (leaseInput) => {
        input?.onLease?.(leaseInput);
        return [leased];
      },
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
        input?.onFail?.(failure);
        return input?.disposition ?? "retry_scheduled";
      },
      telemetry: async ({ now: observedAt }) => queueTelemetry(observedAt),
    },
    attention: {
      recomputeOrganization: async () => attention,
      recomputeAll: async () => [attention],
    },
  };
}

describe("PostgreSQL worker orchestration", () => {
  it("runs one bounded pass through the typed handler registry", async () => {
    let claimedEventTypes: readonly string[] | undefined;
    let claimedMaxAttempts: number | undefined;
    const result = await runWorkerOnce(
      { now, requestId: "request-1" },
      dependencies(
        fakeRepositories({
          onLease: ({ eventTypes, maxAttempts }) => {
            claimedEventTypes = eventTypes;
            claimedMaxAttempts = maxAttempts;
          },
        }),
      ),
    );
    expect(result.requestId).toBe("request-1");
    expect(claimedEventTypes).toEqual(
      createWorkerHandlerRegistry().activeEventTypes,
    );
    expect(claimedMaxAttempts).toBe(3);
    expect(result.outbox).toMatchObject({
      processed: 1,
      failed: 0,
      effects: 2,
    });
    expect(result.attention).toMatchObject({ processed: 1, effects: 2 });
  });

  it("schedules jittered retry from the actual failure time", async () => {
    const failedAt = new Date("2026-08-29T10:00:30.000Z");
    let failure: { now: Date; nextAvailableAt: Date } | undefined;
    const repositories = fakeRepositories({
      processError: new Error("transient"),
      disposition: "retry_scheduled",
      attempt: 2,
      onFail: (value) => {
        failure = value;
      },
    });
    const clockValues = [now, failedAt];
    const result = await runOutboxSweep(
      { now, requestId: "request-retry" },
      dependencies(repositories, {
        clock: () => clockValues.shift() ?? failedAt,
        random: () => 0,
      }),
    );
    expect(result).toMatchObject({
      processed: 0,
      failed: 1,
      retried: 1,
      deadLettered: 0,
    });
    expect(failure?.now).toEqual(failedAt);
    expect(failure?.nextAvailableAt.toISOString()).toBe(
      "2026-08-29T10:01:30.000Z",
    );
  });

  it("keeps exponential jitter inside a deterministic 50-100 percent bound", () => {
    expect(retryAvailableAt(now, 1, () => 0).getTime() - now.getTime()).toBe(
      30_000,
    );
    expect(
      retryAvailableAt(now, 1, () => 0.999).getTime() - now.getTime(),
    ).toBeGreaterThanOrEqual(59_900);
    expect(() => retryAvailableAt(now, 1, () => 1)).toThrow(/randomness/);
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

  it("caps claims to concurrency and processes the bounded lease set together", async () => {
    let claimLimit = 0;
    let active = 0;
    let maximumActive = 0;
    const leases = Array.from({ length: 5 }, (_, index) =>
      lease(1, `event-${index}`),
    );
    const repositories = fakeRepositories();
    repositories.outbox.lease = async (input) => {
      claimLimit = input.limit;
      return leases.slice(0, input.limit);
    };
    repositories.outbox.process = async <T>(
      leased: WorkerLease,
      handler: (repositories: WorkerTransactionRepositories) => Promise<T>,
    ) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const transaction: WorkerTransactionRepositories = {
        event: leased,
        processInternalEvent: async () => ({ recomputed: false, effects: 1 }),
        attention: {
          recomputeOrganization: async () => ({
            organizationId: leased.organizationId,
            created: 0,
            refreshed: 0,
            resolved: 0,
            notifications: 0,
          }),
        },
      };
      const value = await handler(transaction);
      active -= 1;
      return { status: "processed" as const, value };
    };

    const result = await runOutboxSweep(
      { now, requestId: "request-concurrent" },
      dependencies(repositories, { batchSize: 10, concurrency: 2 }),
    );
    expect(claimLimit).toBe(2);
    expect(maximumActive).toBe(2);
    expect(result).toMatchObject({ processed: 2, effects: 2 });
  });

  it("honors global and per-handler kill switches without leasing", async () => {
    let leases = 0;
    let attentionSweeps = 0;
    const repositories = fakeRepositories({
      onLease: () => {
        leases += 1;
      },
    });
    repositories.attention.recomputeAll = async () => {
      attentionSweeps += 1;
      return [];
    };

    await runWorkerOnce(
      { now, requestId: "request-disabled" },
      dependencies(repositories, { enabled: false }),
    );
    await runWorkerOnce(
      { now, requestId: "request-handler-disabled" },
      dependencies(repositories, {
        handlerRegistry: createWorkerHandlerRegistry(defaultWorkerHandlers, [
          "attention",
          "audit",
          "collaboration",
        ]),
      }),
    );

    expect(leases).toBe(0);
    expect(attentionSweeps).toBe(0);
  });

  it("recovers the continuous loop after a sweep-level repository failure", async () => {
    const abortController = new AbortController();
    const repositories = fakeRepositories();
    const records: Array<Record<string, unknown>> = [];
    let leaseCalls = 0;
    repositories.outbox.lease = async () => {
      leaseCalls += 1;
      if (leaseCalls === 1) throw new Error("database temporarily unavailable");
      return [];
    };
    repositories.outbox.telemetry = async ({ now: observedAt }) => {
      abortController.abort();
      return queueTelemetry(observedAt);
    };
    repositories.attention.recomputeAll = async () => [];

    await expect(
      runWorkerLoop(
        dependencies(repositories, {
          log: (record) => records.push(record),
        }),
        {
          pollIntervalMs: 100,
          attentionSweepIntervalMs: 1_000,
          telemetryIntervalMs: 1_000,
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

  it("drains an in-flight bounded pass after shutdown without taking another lease", async () => {
    const abortController = new AbortController();
    const repositories = fakeRepositories();
    let leaseCalls = 0;
    let attentionSweeps = 0;
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const processingStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const mayFinish = new Promise<void>((resolve) => {
      release = resolve;
    });
    repositories.outbox.lease = async () => {
      leaseCalls += 1;
      return [lease()];
    };
    repositories.outbox.process = async <T>(
      leased: WorkerLease,
      handler: (repositories: WorkerTransactionRepositories) => Promise<T>,
    ) => {
      started?.();
      await mayFinish;
      const transaction: WorkerTransactionRepositories = {
        event: leased,
        processInternalEvent: async () => ({ recomputed: false }),
        attention: {
          recomputeOrganization: async () => ({
            organizationId: leased.organizationId,
            created: 0,
            refreshed: 0,
            resolved: 0,
            notifications: 0,
          }),
        },
      };
      return {
        status: "processed" as const,
        value: await handler(transaction),
      };
    };
    repositories.attention.recomputeAll = async () => {
      attentionSweeps += 1;
      return [];
    };

    const loop = runWorkerLoop(dependencies(repositories), {
      pollIntervalMs: 100,
      attentionSweepIntervalMs: 1_000,
      telemetryIntervalMs: 1_000,
      signal: abortController.signal,
    });
    await processingStarted;
    abortController.abort();
    release?.();
    await expect(loop).resolves.toBeUndefined();
    expect(leaseCalls).toBe(1);
    expect(attentionSweeps).toBe(0);
  });
});
