import { describe, expect, it } from "vitest";
import {
  parseThemePreference,
  resolveTheme,
  serializeThemePreferenceCookie,
  themePreferenceCookie,
} from "./display-preferences";

describe("display preferences", () => {
  it("accepts only supported explicit theme cookie values", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBeUndefined();
    expect(parseThemePreference("DARK")).toBeUndefined();
    expect(parseThemePreference("")).toBeUndefined();
    expect(parseThemePreference(undefined)).toBeUndefined();
  });

  it("uses the system scheme only until an explicit preference exists", () => {
    expect(resolveTheme(undefined, false)).toBe("light");
    expect(resolveTheme(undefined, true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("serializes a durable same-site cookie and secures it on HTTPS", () => {
    expect(serializeThemePreferenceCookie("dark")).toBe(
      `${themePreferenceCookie}=dark; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
    expect(serializeThemePreferenceCookie("light", true)).toBe(
      `${themePreferenceCookie}=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
  });
});
