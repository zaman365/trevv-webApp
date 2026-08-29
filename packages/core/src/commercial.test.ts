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
  demoWorkspaces,
  demoItems,
  demoMeaningfulChanges,
  demoWaitingStates,
  generateAttentionSignals,
  opportunityScore,
  privateBetaFoundationEntitlements,
  previewBlueprintUpdate,
  unrestrictedDevelopmentEntitlements,
} from "./index";

const now = new Date("2026-08-24T12:00:00.000Z");

describe("TREVV commercial domain", () => {
  it("checks capabilities by entitlement key without plan-name branching", () => {
    expect(
      checkEntitlement(
        unrestrictedDevelopmentEntitlements,
        "workspaces.max",
        99,
      ).allowed,
    ).toBe(true);
    expect(
      checkEntitlement(
        { planKey: "custom", values: { "workspaces.max": 3 } },
        "workspaces.max",
        3,
      ).allowed,
    ).toBe(false);
  });

  it("keeps the private-beta foundation free of prices and external effects", () => {
    expect(privateBetaFoundationEntitlements.planKey).toBe(
      "private-beta-foundation",
    );
    expect(privateBetaFoundationEntitlements.values).toMatchObject({
      "automations.monthly": 0,
      "ai.actions": 0,
      "automation.external_effects": false,
      "billing.checkout": false,
      "files.private_storage": false,
      "integration.google_calendar": false,
      "integration.github": false,
      "integration.drive": false,
      "integration.figma": false,
      "integration.slack": false,
    });
    expect(JSON.stringify(privateBetaFoundationEntitlements)).not.toMatch(
      /price|amount|currency/i,
    );
  });

  it("fails closed for invalid entitlement usage and numeric limits", () => {
    for (const [currentUsage, requested] of [
      [-1, 1],
      [0, -1],
      [0, 0],
      [Number.NaN, 1],
      [0, Number.POSITIVE_INFINITY],
      [0.5, 1],
    ] as const) {
      expect(
        checkEntitlement(
          privateBetaFoundationEntitlements,
          "ai.actions",
          currentUsage,
          requested,
        ),
      ).toMatchObject({
        allowed: false,
        reason: "The entitlement usage request is invalid.",
      });
    }
    expect(
      checkEntitlement(
        {
          planKey: "invalid",
          values: { "ai.actions": Number.POSITIVE_INFINITY },
        },
        "ai.actions",
      ),
    ).toMatchObject({
      allowed: false,
      reason: "The entitlement usage request is invalid.",
    });
  });

  it("derives and ranks explainable signals from operational evidence", () => {
    const signals = generateAttentionSignals(
      "org-demo",
      demoWorkspaces,
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
          signal.metadata.crossWorkspace === true,
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

  it("surfaces cross-Workspace resource pressure without hourly estimates", () => {
    const pressure = calculateResourcePressure(demoWorkspaces, demoItems, now);
    expect(pressure[0]?.userName).toBeTruthy();
    expect(pressure.some((person) => person.workspaceIds.length > 1)).toBe(
      true,
    );
  });
});
