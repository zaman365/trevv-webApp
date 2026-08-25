import { describe, expect, it } from "vitest";
import {
  boardForHub,
  calculateHubProgress,
  demoHubs,
  demoItems,
  hubsForPortfolio,
  itemsForBoard,
  portfolioSignals,
  rollupHub,
  validateDemoRelationships,
} from "./index";

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
      demoHubs.find((candidate) => candidate.slug === "greentable")!,
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
  it("keeps every Portfolio, Hub, Board, and item relationship valid", () => {
    expect(validateDemoRelationships()).toEqual([]);
    expect(demoHubs.every((hub) => boardForHub(hub.id))).toBe(true);
  });
  it("restores the original projects with isolated Boards and equal rollups", () => {
    const originals = hubsForPortfolio("portfolio-original");
    expect(originals.map((hub) => hub.name)).toEqual([
      "ZEHN",
      "Leckereich",
      "MarktFix",
      "LokalFix",
      "MikroIT",
      "GastroFix",
      "IntelligentLab",
      "BigBoyz",
    ]);
    const zehn = originals.find((hub) => hub.slug === "zehn")!;
    const board = boardForHub(zehn.id)!;
    expect(board.id).toBe("original-b-northstar-launch");
    expect(boardForHub(zehn.id, "b-northstar-launch")).toBeUndefined();
    expect(
      itemsForBoard(board.id).every((item) => item.hubId === zehn.id),
    ).toBe(true);
    expect(calculateHubProgress(zehn)).toBe(
      calculateHubProgress(
        demoHubs.find((hub) => hub.slug === "northstar-apparel")!,
      ),
    );
  });
});
