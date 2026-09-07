import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calendarDays,
  calendarRange,
  dateKey,
  localDateKey,
} from "./calendar-range";
afterEach(() => vi.unstubAllEnvs());
describe("calendar local-day boundaries", () => {
  it.each(["Europe/Berlin", "America/New_York"])(
    "keeps all local days across daylight saving in %s",
    (timezone) => {
      vi.stubEnv("TZ", timezone);
      const anchor = new Date(2026, 2, 15);
      const days = calendarDays(anchor, "month");
      expect(days).toHaveLength(42);
      expect(new Set(days.map(dateKey)).size).toBe(42);
      expect(days.every((day) => day.getHours() === 0)).toBe(true);
      const range = calendarRange(anchor, "week");
      expect(range.from.getDay()).toBe(1);
      expect(calendarDays(anchor, "week")).toHaveLength(7);
    },
  );
  it("buckets an instant by its displayed local day rather than its UTC prefix", () => {
    vi.stubEnv("TZ", "Europe/Berlin");
    expect(localDateKey("2026-03-29T23:30:00Z")).toBe("2026-03-30");
    vi.stubEnv("TZ", "America/New_York");
    expect(localDateKey("2026-03-29T23:30:00Z")).toBe("2026-03-29");
  });
});
