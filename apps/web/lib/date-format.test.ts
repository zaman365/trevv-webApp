import { describe, expect, it } from "vitest";
import { dateTimeFormatter } from "./date-format";

describe("shared date formatting", () => {
  it("does not conflate Intl.Locale instances", () => {
    const english = dateTimeFormatter(new Intl.Locale("en-GB"));
    const german = dateTimeFormatter(new Intl.Locale("de-DE"));
    expect(english.resolvedOptions().locale).toBe("en-GB");
    expect(german.resolvedOptions().locale).toBe("de-DE");
    expect(english).not.toBe(german);
  });
  it("reuses equivalent configurations independent of property order", () => {
    expect(dateTimeFormatter("en", { month: "short", day: "numeric" })).toBe(
      dateTimeFormatter("en", { day: "numeric", month: "short" }),
    );
  });

  it("preserves locale, timezone, DST and date-only output", () => {
    for (const locale of ["en-GB", "de-DE"]) {
      for (const timeZone of ["UTC", "Europe/Berlin", "America/New_York"]) {
        for (const value of ["2026-03-29T01:30:00Z", "2026-10-25T01:30:00Z"]) {
          const options = {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone,
          } as const;
          expect(
            dateTimeFormatter(locale, options).format(new Date(value)),
          ).toBe(
            new Intl.DateTimeFormat(locale, options).format(new Date(value)),
          );
        }
      }
    }
    expect(
      dateTimeFormatter("en", { dateStyle: "medium" }).format(
        new Date("2026-09-05T12:00:00Z"),
      ),
    ).toBe(
      new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
        new Date("2026-09-05T12:00:00Z"),
      ),
    );
  });
});
