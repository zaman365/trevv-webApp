import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOCABULARY,
  labelForProjectType,
  vocabularyFor,
} from "./terminology";

describe("customer-facing Workspace terminology", () => {
  it("uses Workspace as the default responsibility name", () => {
    expect(DEFAULT_VOCABULARY).toBe("projects");
    expect(vocabularyFor()).toMatchObject({
      one: "Workspace",
      many: "Workspaces",
    });
  });

  it("describes a Workspace type without bringing back Workspace jargon", () => {
    expect(labelForProjectType("brand")).toBe("Brand workspace");
    expect(labelForProjectType("project")).toBe("Project workspace");
  });
});
