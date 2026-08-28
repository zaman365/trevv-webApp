import { describe, expect, it } from "vitest";
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

  it("links guides only to application routes that exist", () => {
    const applicationRoutes = new Set([
      "/app/approvals",
      "/app/attention",
      "/app/blueprints",
      "/app/dashboard",
      "/app/decisions",
      "/app/home",
      "/app/workspaces",
      "/app/ideas",
      "/app/inbox",
      "/app/my-work",
      "/app/notifications",
      "/app/portfolio",
      "/app/reviews",
      "/app/search",
      "/app/settings/import",
      "/app/settings/integrations",
      "/app/team",
      "/app/waiting",
    ]);
    const linkedRoutes = learningResources
      .map((resource) => resource.route?.split(/[?#]/, 1)[0])
      .filter((route): route is string => Boolean(route));

    expect(
      linkedRoutes.filter((route) => !applicationRoutes.has(route)),
    ).toEqual([]);
  });
});
