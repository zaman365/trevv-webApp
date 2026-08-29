import { describe, expect, it } from "vitest";
import {
  createWorkerHealthState,
  startWorkerHealthServer,
} from "./health-server";

const observedAt = new Date("2026-08-29T10:00:00.000Z");
const queue = {
  observedAt,
  ready: 2,
  delayed: 1,
  leased: 0,
  deadLettered: 0,
  paused: 0,
  unsupported: 1,
  oldestReadyAgeMs: 60_000,
  oldestUnsupportedAgeMs: 120_000,
  attempts: { leased: 0, succeeded: 4, failed: 1, deadLettered: 0 },
};

describe("worker health server", () => {
  it("separates process liveness from fresh database-backed readiness", async () => {
    let current = observedAt;
    const state = createWorkerHealthState({
      enabled: true,
      activeHandlerNames: ["attention"],
      disabledHandlerNames: [],
      readinessMaxStalenessMs: 1_000,
      readinessMaxUnsupportedAgeMs: 300_000,
      clock: () => current,
    });
    const server = await startWorkerHealthServer({
      host: "127.0.0.1",
      port: 0,
      state,
    });
    try {
      expect((await fetch(`${server.origin}/livez`)).status).toBe(200);
      expect((await fetch(`${server.origin}/readyz`)).status).toBe(503);

      state.recordSuccessfulSweep(observedAt, queue);
      const ready = await fetch(`${server.origin}/readyz`);
      expect(ready.status).toBe(200);
      await expect(ready.json()).resolves.toMatchObject({
        status: "ready",
        queue: { ready: 2, unsupported: 1 },
      });
      await expect(
        fetch(`${server.origin}/metrics.json`).then((response) =>
          response.json(),
        ),
      ).resolves.toMatchObject({
        status: "ready",
        lastSuccessfulSweepAt: observedAt.toISOString(),
        queue: { attempts: { failed: 1 } },
      });
      const metrics = await fetch(`${server.origin}/metrics`).then((response) =>
        response.text(),
      );
      expect(metrics).toContain("trevv_worker_ready 1");
      expect(metrics).toContain('trevv_worker_queue_events{state="ready"} 2');
      expect(metrics).toContain('trevv_worker_attempts{outcome="failed"} 1');

      current = new Date("2026-08-29T10:00:01.001Z");
      expect((await fetch(`${server.origin}/readyz`)).status).toBe(503);
      state.beginShutdown();
      expect((await fetch(`${server.origin}/livez`)).status).toBe(503);
    } finally {
      await server.close();
    }
  });

  it("fails readiness when an unknown event outlives its grace period", () => {
    const state = createWorkerHealthState({
      enabled: true,
      activeHandlerNames: ["attention", "audit", "collaboration"],
      disabledHandlerNames: [],
      readinessMaxStalenessMs: 30_000,
      readinessMaxUnsupportedAgeMs: 120_000,
      clock: () => observedAt,
    });
    state.recordSuccessfulSweep(observedAt, {
      ...queue,
      oldestUnsupportedAgeMs: 120_000,
    });
    expect(state.snapshot()).toMatchObject({
      status: "not_ready",
      queue: { unsupported: 1, oldestUnsupportedAgeMs: 120_000 },
    });
  });

  it("advances unsupported-event age while long-interval telemetry is cached", () => {
    let current = observedAt;
    const unsupportedGraceMs = 1_000;
    const telemetryIntervalMs = 3_600_000;
    expect(unsupportedGraceMs).toBeLessThan(telemetryIntervalMs);
    const state = createWorkerHealthState({
      enabled: true,
      activeHandlerNames: ["attention", "audit", "collaboration"],
      disabledHandlerNames: [],
      readinessMaxStalenessMs: telemetryIntervalMs * 2,
      readinessMaxUnsupportedAgeMs: unsupportedGraceMs,
      clock: () => current,
    });
    const cachedQueue = {
      ...queue,
      observedAt,
      oldestUnsupportedAgeMs: 0,
    };
    state.recordSuccessfulSweep(observedAt, cachedQueue);
    expect(state.snapshot().status).toBe("ready");

    current = new Date(observedAt.getTime() + unsupportedGraceMs - 1);
    state.recordSuccessfulSweep(current, cachedQueue);
    expect(state.snapshot().status).toBe("ready");

    current = new Date(observedAt.getTime() + unsupportedGraceMs);
    state.recordSuccessfulSweep(current, cachedQueue);
    expect(state.snapshot()).toMatchObject({
      status: "not_ready",
      lastSuccessfulSweepAt: current.toISOString(),
      queue: {
        observedAt,
        unsupported: 1,
        oldestUnsupportedAgeMs: unsupportedGraceMs,
      },
    });
  });

  it("never reports a disabled worker as ready", () => {
    const state = createWorkerHealthState({
      enabled: false,
      activeHandlerNames: ["attention"],
      disabledHandlerNames: [],
      readinessMaxStalenessMs: 30_000,
      readinessMaxUnsupportedAgeMs: 300_000,
      clock: () => observedAt,
    });
    state.recordSuccessfulSweep(observedAt, queue);
    expect(state.snapshot()).toMatchObject({
      status: "not_ready",
      enabled: false,
    });
  });

  it("fails readiness on dead letters, stale ready work, or a latest failed sweep", () => {
    let current = observedAt;
    const state = createWorkerHealthState({
      enabled: true,
      activeHandlerNames: ["attention"],
      disabledHandlerNames: [],
      readinessMaxStalenessMs: 30_000,
      readinessMaxReadyAgeMs: 120_000,
      readinessMaxUnsupportedAgeMs: 300_000,
      readinessMaxDeadLetters: 0,
      clock: () => current,
    });
    state.recordSuccessfulSweep(observedAt, {
      ...queue,
      unsupported: 0,
      oldestUnsupportedAgeMs: null,
      deadLettered: 1,
    });
    expect(state.snapshot()).toMatchObject({
      status: "not_ready",
      checks: { deadLettersWithinLimit: false },
    });

    state.recordSuccessfulSweep(observedAt, {
      ...queue,
      unsupported: 0,
      oldestUnsupportedAgeMs: null,
      deadLettered: 0,
      oldestReadyAgeMs: 120_000,
    });
    expect(state.snapshot()).toMatchObject({
      status: "not_ready",
      checks: { readyBacklogWithinLimit: false },
    });

    current = new Date(observedAt.getTime() + 1);
    state.recordSuccessfulSweep(current, {
      ...queue,
      ready: 0,
      oldestReadyAgeMs: null,
      unsupported: 0,
      oldestUnsupportedAgeMs: null,
      deadLettered: 0,
    });
    state.recordFailedSweep(new Date(current.getTime() + 1));
    expect(state.snapshot()).toMatchObject({
      status: "not_ready",
      checks: { latestSweepSucceeded: false },
    });
  });
});
