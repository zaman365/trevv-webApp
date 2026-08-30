export const themePreferenceCookie = "trevv.theme";
export const darkThemeMediaQuery = "(prefers-color-scheme: dark)";

// This constant is safe to emit from the static root layout: it contains no
// request data and validates the browser cookie before touching the document.
// Keeping preference resolution in the browser lets public routes remain
// statically renderable while the protected /app layout still reads the same
// cookie for its first React render.
export const themePreferenceBootstrap = `(()=>{try{const match=document.cookie.match(/(?:^|;\\s*)${themePreferenceCookie.replace(".", "\\.")}=(light|dark)(?:;|$)/);if(match?.[1])document.documentElement.dataset.theme=match[1];else document.documentElement.removeAttribute("data-theme")}catch{}})();`;

const themePreferenceMaxAge = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark";

export function parseThemePreference(
  raw: string | null | undefined,
): Theme | undefined {
  return raw === "light" || raw === "dark" ? raw : undefined;
}

export function resolveTheme(
  preference: Theme | undefined,
  prefersDark: boolean,
): Theme {
  return preference ?? (prefersDark ? "dark" : "light");
}

export function serializeThemePreferenceCookie(
  preference: Theme,
  secure = false,
): string {
  return `${themePreferenceCookie}=${preference}; Path=/; Max-Age=${themePreferenceMaxAge}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function writeThemePreference(preference: Theme): void {
  try {
    document.cookie = serializeThemePreferenceCookie(
      preference,
      window.location.protocol === "https:",
    );
  } catch {
    // The explicit theme still applies for the current document.
  }
}
