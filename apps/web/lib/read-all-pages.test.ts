import { describe, expect, it, vi } from "vitest";
import { readAllPages } from "./read-all-pages";

describe("complete cursor collections", () => {
  it.each([9_999, 10_000, 10_001])(
    "preserves all %s records including a terminal empty page",
    async (size) => {
      const read = vi.fn(async (cursor?: string) => {
        const start = Number(cursor ?? 0);
        const data = Array.from(
          { length: Math.min(100, size - start) },
          (_, i) => start + i,
        );
        return {
          data,
          nextCursor: data.length === 100 ? String(start + 100) : null,
        };
      });
      const records = await readAllPages(read);
      expect(records).toHaveLength(size);
      expect(new Set(records).size).toBe(size);
      expect(records.at(-1)).toBe(size - 1);
      expect(read).toHaveBeenCalledTimes(Math.floor(size / 100) + 1);
    },
  );
  it("fails a repeating cursor instead of silently truncating or looping forever", async () => {
    await expect(
      readAllPages(async () => ({ data: [1], nextCursor: "repeat" })),
    ).rejects.toThrow("repeated a pagination cursor");
  });
  it("propagates cancellation without returning a partial successful collection", async () => {
    const reason = new DOMException("Aborted", "AbortError");
    const read = vi
      .fn()
      .mockResolvedValueOnce({ data: [1], nextCursor: "next" })
      .mockRejectedValueOnce(reason);
    await expect(readAllPages(read)).rejects.toBe(reason);
  });
});
