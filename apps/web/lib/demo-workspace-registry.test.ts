import { describe, expect, it } from "vitest";
import {
  isDemoWorkspaceSlug,
  parseDemoWorkspaceRegistry,
  serializeDemoWorkspaceRegistry,
} from "./demo-workspace-registry";

describe("fictional demo workspace registry", () => {
  it("round-trips only bounded, canonical slugs", () => {
    const slugs = [
      "launch-plan",
      "launch-plan",
      "not valid",
      ...Array.from({ length: 30 }, (_, index) => `workspace-${index}`),
    ];
    const parsed = parseDemoWorkspaceRegistry(
      serializeDemoWorkspaceRegistry(slugs),
    );

    expect(parsed).toHaveLength(20);
    expect(parsed[0]).toBe("launch-plan");
    expect(parsed).not.toContain("not valid");
  });

  it("rejects malformed or unsafe values", () => {
    expect(parseDemoWorkspaceRegistry("not-json")).toEqual([]);
    expect(isDemoWorkspaceSlug("-workspace")).toBe(false);
    expect(isDemoWorkspaceSlug("workspace/")).toBe(false);
    expect(isDemoWorkspaceSlug("workspace-name")).toBe(true);
  });
});
