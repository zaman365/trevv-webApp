import { afterEach, describe, expect, it, vi } from "vitest";
import { createBufferedPersistence } from "./buffered-persistence";
afterEach(() => vi.useRealTimers());
describe("recoverable draft persistence", () => {
  it("coalesces typing but saves continuously active drafts within a bounded interval", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = createBufferedPersistence(write, 250);
    writer.schedule("a");
    vi.advanceTimersByTime(100);
    writer.schedule("ab");
    vi.advanceTimersByTime(150);
    expect(write).toHaveBeenCalledExactlyOnceWith("ab");
  });
  it("flushes the latest draft once on navigation and keeps old/new identity writes separate", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const oldWriter = createBufferedPersistence(first);
    const newWriter = createBufferedPersistence(second);
    oldWriter.schedule({ room: "old", body: "Unsent" });
    newWriter.schedule({ room: "new", body: "Another" });
    oldWriter.flush();
    oldWriter.flush();
    vi.runAllTimers();
    expect(first).toHaveBeenCalledExactlyOnceWith({
      room: "old",
      body: "Unsent",
    });
    expect(second).toHaveBeenCalledExactlyOnceWith({
      room: "new",
      body: "Another",
    });
  });
});
