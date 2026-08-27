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
});
