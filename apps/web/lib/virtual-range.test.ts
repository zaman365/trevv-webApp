import { describe, expect, it } from "vitest";
import {
  indexAtOffset,
  itemOffsets,
  visibleItemIndexes,
} from "./virtual-range";

describe("windowed collections", () => {
  it("bounds mounted rows at 10,000 records and preserves a focused offscreen row", () => {
    const keys = Array.from({ length: 10_000 }, (_, index) => String(index));
    const offsets = itemOffsets(keys, new Map(), 80);
    const visible = visibleItemIndexes(offsets, 400_000, 640, 2);
    expect(visible).toContain(2);
    expect(visible).toContain(5_000);
    expect(visible.length).toBeLessThan(25);
    expect(offsets.at(-1)).toBe(800_000);
  });
  it("uses measured heights by stable identity after insertions and handles the last row", () => {
    const offsets = itemOffsets(
      ["new", "a", "b"],
      new Map([
        ["a", 140],
        ["b", 60],
      ]),
      100,
    );
    expect(offsets).toEqual([0, 100, 240, 300]);
    expect(indexAtOffset(offsets, 299)).toBe(2);
    expect(visibleItemIndexes(offsets, 299, 800)).toEqual([0, 1, 2]);
    expect(visibleItemIndexes([0], 0, 600)).toEqual([]);
  });
});
