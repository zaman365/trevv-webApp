import { describe, expect, it } from "vitest";
import {
  attentionScore,
  calculateResourcePressure,
  changesSinceCheckpoint,
  checkEntitlement,
  demoBlueprintInstances,
  demoBlueprintVersions,
  demoChangeCheckpoint,
  demoDependencies,
  demoHubs,
  demoItems,
  demoMeaningfulChanges,
  demoWaitingStates,
  generateAttentionSignals,
  opportunityScore,
  previewBlueprintUpdate,
  unrestrictedDevelopmentEntitlements,
} from "./index";

const now = new Date("2026-08-24T12:00:00.000Z");

describe("TREVV commercial domain", () => {
  it("checks capabilities by entitlement key without plan-name branching", () => {
    expect(
      checkEntitlement(unrestrictedDevelopmentEntitlements, "hubs.max", 99)
        .allowed,
    ).toBe(true);
    expect(
      checkEntitlement(
        { planKey: "custom", values: { "hubs.max": 3 } },
        "hubs.max",
        3,
      ).allowed,
    ).toBe(false);
  });

  it("derives and ranks explainable signals from operational evidence", () => {
    const signals = generateAttentionSignals(
      "org-demo",
      demoHubs,
      demoItems,
      demoWaitingStates,
      now,
      demoDependencies,
    );
    expect(signals.some((signal) => signal.signalType === "blocked_work")).toBe(
      true,
    );
    expect(
      signals.some((signal) => signal.signalType === "waiting_too_long"),
    ).toBe(true);
    expect(
      signals.some(
        (signal) =>
          signal.signalType === "dependency_threat" &&
          signal.metadata.crossHub === true,
      ),
    ).toBe(true);
    expect(signals.every((signal) => signal.reason.length > 10)).toBe(true);
    expect(attentionScore(signals[0]!, now)).toBeGreaterThanOrEqual(
      attentionScore(signals.at(-1)!, now),
    );
  });

  it("filters Change Radar noise below the meaningful threshold", () => {
    const changes = changesSinceCheckpoint(
      demoMeaningfulChanges,
      demoChangeCheckpoint,
    );
    expect(changes.map((change) => change.id)).not.toContain(
      "change-noise-comment",
    );
    expect(changes.length).toBeGreaterThan(2);
  });

  it("scores optional opportunity evidence only when all inputs exist", () => {
    expect(
      opportunityScore({
        itemId: "idea-1",
        expectedImpact: 4,
        confidence: 4,
        strategicFit: 5,
        effort: 2,
      }),
    ).toBe(40);
    expect(opportunityScore({ itemId: "idea-2" })).toBeNull();
  });

  it("previews Blueprint improvements while preserving local overrides", () => {
    const diff = previewBlueprintUpdate(
      demoBlueprintInstances[0]!,
      demoBlueprintVersions[0]!,
      demoBlueprintVersions[1]!,
    );
    expect(diff.additions).toContain("Group: Evidence ready");
    expect(diff.preservedOverrides).toEqual(["Client review"]);
  });

  it("surfaces cross-Hub resource pressure without hourly estimates", () => {
    const pressure = calculateResourcePressure(demoHubs, demoItems, now);
    expect(pressure[0]?.userName).toBeTruthy();
    expect(pressure.some((person) => person.hubIds.length > 1)).toBe(true);
  });
});
