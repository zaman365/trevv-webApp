import { demoWorkspaces } from "@founderhq/core";
import { describe, expect, it } from "vitest";
import { NOW, scopeWorkspace } from "./attention";

describe("workspace scope", () => {
  it("keeps portfolio scope when no project is selected", () => {
    const scope = scopeWorkspace("portfolio-demo", NOW);

    expect(scope.projectId).toBeNull();
    expect(scope.workspaces.length).toBeGreaterThan(1);
  });

  it("narrows every derived collection to the selected project", () => {
    const project = demoWorkspaces.find(
      (workspace) => workspace.id === "workspace-northstar",
    )!;
    const scope = scopeWorkspace(project.portfolioId, NOW, project.id);

    expect(scope.projectId).toBe(project.id);
    expect(scope.workspaces.map((workspace) => workspace.id)).toEqual([
      project.id,
    ]);
    expect(scope.items.every((item) => item.workspaceId === project.id)).toBe(
      true,
    );
    expect(scope.waiting.every((item) => item.workspaceId === project.id)).toBe(
      true,
    );
    expect(
      scope.attention.every((item) => item.workspaceId === project.id),
    ).toBe(true);
  });

  it("keeps a newly created project available as an empty project workspace", () => {
    const source = demoWorkspaces[0]!;
    const customProject = {
      ...source,
      id: "custom-workspace-test",
      slug: "custom-workspace-test",
      name: "Custom project",
    };
    const scope = scopeWorkspace(
      customProject.portfolioId,
      NOW,
      customProject.id,
      [customProject],
    );

    expect(scope.workspaces).toEqual([customProject]);
    expect(scope.items).toEqual([]);
    expect(scope.attentionCount).toBe(0);
  });
});
