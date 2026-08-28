import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOCABULARY,
  labelForProjectType,
  vocabularyFor,
} from "./terminology";

describe("customer-facing project terminology", () => {
  it("uses projects as the default responsibility name", () => {
    expect(DEFAULT_VOCABULARY).toBe("projects");
    expect(vocabularyFor()).toMatchObject({ one: "Project", many: "Projects" });
  });

  it("describes a project's type without bringing back Hub jargon", () => {
    expect(labelForProjectType("brand")).toBe("Brand project");
    expect(labelForProjectType("project")).toBe("Project");
  });
});
