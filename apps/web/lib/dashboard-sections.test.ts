import { describe, expect, it } from "vitest";
import {
  dashboardSectionFromSearch,
  dashboardSectionUrl,
  dashboardSections,
  dashboardNavigationSections,
} from "./dashboard-sections";
import { isWorkspaceView } from "./workspace-routes";

describe("dashboard sections", () => {
  it("restores known sections and safely defaults unsupported links", () => {
    expect(dashboardSectionFromSearch("?section=teams")).toBe("teams");
    expect(dashboardSectionFromSearch("?section=settings")).toBe("summary");
    expect(dashboardSectionFromSearch("?section=messages")).toBe("summary");
    expect(dashboardSectionFromSearch("?section=inbox")).toBe("summary");
    expect(dashboardSectionFromSearch("")).toBe("summary");
  });
  it("removes communication tabs only from Dashboard navigation", () => {
    expect(dashboardNavigationSections.map(({ id }) => id)).toEqual([
      "summary",
      "attention",
      "my-work",
      "planning",
      "ideas",
      "teams",
      "decisions",
      "approvals",
      "waiting",
    ]);
    expect(dashboardSections.find(({ id }) => id === "messages")).toBeDefined();
    expect(dashboardSections.find(({ id }) => id === "inbox")).toBeDefined();
  });
  it("changes only the section and old detail hash, keeping workspace and other parameters", () => {
    expect(
      dashboardSectionUrl(
        "https://trevv.test/app/workspaces/launch?filter=mine#issue:one",
        "messages",
      ),
    ).toBe("/app/workspaces/launch?filter=mine&section=messages");
    expect(
      dashboardSectionUrl(
        "https://trevv.test/app/workspaces/launch/dashboard?section=teams&filter=mine",
        "summary",
      ),
    ).toBe("/app/workspaces/launch/dashboard?filter=mine");
  });
  it("has a full-page destination for every section", () => {
    expect(
      dashboardSections.every((section) => isWorkspaceView(section.view)),
    ).toBe(true);
    expect(new Set(dashboardSections.map((section) => section.id)).size).toBe(
      dashboardSections.length,
    );
  });
});
