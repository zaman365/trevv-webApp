import { demoHubs } from "@founderhq/core";
import { describe, expect, it } from "vitest";
import { NOW, scopeWorkspace } from "./attention";

describe("workspace scope", () => {
  it("keeps portfolio scope when no project is selected", () => {
    const scope = scopeWorkspace("portfolio-demo", NOW);

    expect(scope.projectId).toBeNull();
    expect(scope.hubs.length).toBeGreaterThan(1);
  });

  it("narrows every derived collection to the selected project", () => {
    const project = demoHubs.find((hub) => hub.id === "hub-northstar")!;
    const scope = scopeWorkspace(project.portfolioId, NOW, project.id);

    expect(scope.projectId).toBe(project.id);
    expect(scope.hubs.map((hub) => hub.id)).toEqual([project.id]);
    expect(scope.items.every((item) => item.hubId === project.id)).toBe(true);
    expect(scope.waiting.every((item) => item.hubId === project.id)).toBe(
      true,
    );
    expect(scope.attention.every((item) => item.hubId === project.id)).toBe(
      true,
    );
  });

  it("keeps a newly created project available as an empty project workspace", () => {
    const source = demoHubs[0]!;
    const customProject = {
      ...source,
      id: "custom-hub-test",
      slug: "custom-hub-test",
      name: "Custom project",
    };
    const scope = scopeWorkspace(
      customProject.portfolioId,
      NOW,
      customProject.id,
      [customProject],
    );

    expect(scope.hubs).toEqual([customProject]);
    expect(scope.items).toEqual([]);
    expect(scope.attentionCount).toBe(0);
  });
});
