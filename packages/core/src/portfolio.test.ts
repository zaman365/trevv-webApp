import { describe, expect, it } from "vitest";
import {
  boardForWorkspace,
  calculateWorkspaceProgress,
  demoWorkspaces,
  demoItems,
  workspacesForPortfolio,
  itemsForBoard,
  portfolioSignals,
  rollupWorkspace,
  validateDemoRelationships,
} from "./index";

describe("portfolio roll-ups", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  it("calculates attention from underlying work", () => {
    const signals = portfolioSignals(demoWorkspaces, demoItems, now);
    expect(signals.decisions).toBeGreaterThan(0);
    expect(signals.approvals).toBeGreaterThan(0);
    expect(signals.blocked).toBeGreaterThan(0);
    expect(signals.overdueMilestones).toBeGreaterThan(0);
  });
  it("never mutates or silently derives manual health", () => {
    const workspace = structuredClone(
      demoWorkspaces.find((candidate) => candidate.slug === "greentable")!,
    );
    const before = workspace.health;
    const rollup = rollupWorkspace(workspace, demoItems, now);
    expect(rollup.overdue).toBeGreaterThan(0);
    expect(workspace.health).toBe(before);
    expect(workspace.health).toBe("critical");
  });
  it("keeps parked Workspaces visible without manufacturing progress", () => {
    const workspace = demoWorkspaces.find(
      (candidate) => candidate.health === "parked",
    )!;
    expect(rollupWorkspace(workspace, demoItems, now).score).toBe(0);
  });
  it("keeps every Portfolio, Workspace, Board, and item relationship valid", () => {
    expect(validateDemoRelationships()).toEqual([]);
    expect(
      demoWorkspaces.every((workspace) => boardForWorkspace(workspace.id)),
    ).toBe(true);
  });
  it("restores the original projects with isolated Boards and equal rollups", () => {
    const originals = workspacesForPortfolio("portfolio-original");
    expect(originals.map((workspace) => workspace.name)).toEqual([
      "ZEHN",
      "Leckereich",
      "MarktFix",
      "LokalFix",
      "MikroIT",
      "GastroFix",
      "IntelligentLab",
      "BigBoyz",
    ]);
    const zehn = originals.find((workspace) => workspace.slug === "zehn")!;
    const board = boardForWorkspace(zehn.id)!;
    expect(board.id).toBe("original-b-northstar-launch");
    expect(boardForWorkspace(zehn.id, "b-northstar-launch")).toBeUndefined();
    expect(
      itemsForBoard(board.id).every((item) => item.workspaceId === zehn.id),
    ).toBe(true);
    expect(calculateWorkspaceProgress(zehn)).toBe(
      calculateWorkspaceProgress(
        demoWorkspaces.find(
          (workspace) => workspace.slug === "northstar-apparel",
        )!,
      ),
    );
  });
});
