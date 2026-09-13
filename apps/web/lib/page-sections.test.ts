import { describe, expect, it } from "vitest";
import {
  pageSectionUrl,
  portfolioWorkspaces,
  sectionFromSearch,
  workspaceSectionGroups,
} from "./page-sections";
describe("page sections and portfolio boundaries", () => {
  it("keeps unrelated filters and routes, and clears detail identity on a section change", () => {
    expect(
      pageSectionUrl(
        "https://trevv.test/app/workspaces/a/attention?filter=urgent&workspace=a#issue-one",
        "waiting",
        "attention",
      ),
    ).toBe(
      "/app/workspaces/a/attention?filter=urgent&workspace=a&section=waiting",
    );
    expect(
      pageSectionUrl(
        "https://trevv.test/app/portfolio?section=messages&workspace=a",
        "overview",
        "overview",
      ),
    ).toBe("/app/portfolio?workspace=a");
  });
  it("rejects unsupported sections without changing the original page", () => {
    expect(
      sectionFromSearch(
        "?section=settings",
        workspaceSectionGroups.attention,
        "attention",
      ),
    ).toBe("attention");
    expect(
      sectionFromSearch(
        "?section=approvals",
        workspaceSectionGroups.attention,
        "attention",
      ),
    ).toBe("approvals");
  });
  it("cannot select a workspace from another portfolio or invent one for an empty portfolio", () => {
    const records = [
      { id: "a", portfolioId: "one", slug: "launch" },
      { id: "b", portfolioId: "two", slug: "private" },
    ];
    expect(portfolioWorkspaces(records, "one", "private")).toEqual({
      available: [records[0]],
      selected: records[0],
    });
    expect(portfolioWorkspaces(records, "missing", "launch")).toEqual({
      available: [],
      selected: undefined,
    });
  });
});
