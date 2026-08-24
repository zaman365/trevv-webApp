import { describe, expect, it } from "vitest";
import { demoHubs, demoItems, portfolioSignals, rollupHub } from "./index";

describe("portfolio roll-ups", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  it("calculates attention from underlying work", () => {
    const signals = portfolioSignals(demoHubs, demoItems, now);
    expect(signals.decisions).toBeGreaterThan(0);
    expect(signals.approvals).toBeGreaterThan(0);
    expect(signals.blocked).toBeGreaterThan(0);
    expect(signals.overdueMilestones).toBeGreaterThan(0);
  });
  it("never mutates or silently derives manual health", () => {
    const hub = structuredClone(
      demoHubs.find((candidate) => candidate.slug === "gastrofix")!,
    );
    const before = hub.health;
    const rollup = rollupHub(hub, demoItems, now);
    expect(rollup.overdue).toBeGreaterThan(0);
    expect(hub.health).toBe(before);
    expect(hub.health).toBe("critical");
  });
  it("keeps parked Hubs visible without manufacturing progress", () => {
    const hub = demoHubs.find((candidate) => candidate.health === "parked")!;
    expect(rollupHub(hub, demoItems, now).score).toBe(0);
  });
});
