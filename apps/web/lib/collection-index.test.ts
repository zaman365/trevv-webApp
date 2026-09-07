import { describe, expect, it } from "vitest";
import {
  countByKey,
  groupByKey,
  uniqueById,
  workspaceRollups,
} from "./collection-index";

describe("collection indexes", () => {
  it("retains the first duplicate, source order and original record identities", () => {
    const first = { id: "one", title: "Server version" };
    const second = { id: "two", title: "Another" };
    const result = uniqueById([
      first,
      second,
      { id: "one", title: "Local duplicate" },
    ]);
    expect(result).toEqual([first, second]);
    expect(result[0]).toBe(first);
  });
  it("visits 10,000 entries once per index instead of rescanning for every group", () => {
    let visits = 0;
    const entries = Array.from({ length: 10_000 }, (_, index) => ({
      id: String(index),
      day: String(index % 42),
    }));
    const indexed = groupByKey(entries, (entry) => {
      visits++;
      return entry.day;
    });
    expect(visits).toBe(entries.length);
    expect([...indexed.values()].flat()).toHaveLength(entries.length);
    expect(indexed.get("0")?.[0]).toBe(entries[0]);
    expect(countByKey(entries, (entry) => entry.day).get("0")).toBe(239);
  });
  it("counts only open items while retaining unowned and signal-only workspace totals", () => {
    const result = workspaceRollups(
      [
        { workspaceId: "one", type: "decision", status: "blocked" },
        { workspaceId: "one", type: "approval", status: "planned" },
        { workspaceId: "one", type: "decision", status: "done" },
      ],
      [{ workspaceId: "two" }, {}, { workspaceId: "one" }],
    );
    expect(result.get("one")).toEqual({
      open: 2,
      blocked: 1,
      decisions: 1,
      approvals: 1,
      attention: 1,
    });
    expect(result.get("two")).toEqual({
      open: 0,
      blocked: 0,
      decisions: 0,
      approvals: 0,
      attention: 1,
    });
  });
});
