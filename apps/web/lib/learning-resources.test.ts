import { describe, expect, it } from "vitest";
import {
  isResolvableLearningRoute,
  resolveLearningRoute,
} from "./learning-routes";
import {
  learningCategories,
  learningResources,
  searchLearningResources,
} from "./learning-resources";

describe("learning resources", () => {
  it("keeps a unique, categorized resource catalog", () => {
    const ids = learningResources.map((resource) => resource.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const category of learningCategories) {
      expect(
        learningResources.some((resource) => resource.category === category),
      ).toBe(true);
    }
  });

  it("searches titles, content, and keywords inside a category", () => {
    expect(searchLearningResources("oauth", "Administration")[0]?.id).toBe(
      "integrations",
    );
    expect(searchLearningResources("kanban", "Structure & work")[0]?.id).toBe(
      "boards",
    );
    expect(searchLearningResources("kanban", "Administration")).toHaveLength(0);
  });

  it("links guides only to routes the resolver can reach", () => {
    const linkedRoutes = learningResources
      .map((resource) => resource.route?.split(/[?#]/, 1)[0])
      .filter((route): route is string => Boolean(route));

    expect(
      linkedRoutes.filter((route) => !isResolvableLearningRoute(route)),
    ).toEqual([]);
  });

  it("resolves workspace modules into the active workspace", () => {
    expect(resolveLearningRoute("/app/attention", "northstar-apparel")).toBe(
      "/app/workspaces/northstar-apparel/attention",
    );
  });

  it("falls back to the portfolio when no workspace is selected", () => {
    expect(resolveLearningRoute("/app/attention")).toBe("/app/portfolio");
    expect(resolveLearningRoute("/app/settings/import")).toBe("/app/portfolio");
  });
});
