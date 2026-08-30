export const webVitalNames = [
  "CLS",
  "FCP",
  "FID",
  "INP",
  "LCP",
  "TTFB",
] as const;
export const webVitalRatings = ["good", "needs-improvement", "poor"] as const;
export const webVitalNavigationTypes = [
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
] as const;

export interface WebVitalReport {
  name: (typeof webVitalNames)[number];
  value: number;
  delta: number;
  rating: (typeof webVitalRatings)[number];
  navigationType: (typeof webVitalNavigationTypes)[number];
  surface: string;
}

export function parseRumSampleRate(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 0.1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
}

export function shouldSampleWebVitals(
  enabled: boolean,
  sampleRate: number,
  randomValue: number,
): boolean {
  return (
    enabled &&
    sampleRate > 0 &&
    sampleRate <= 1 &&
    randomValue >= 0 &&
    randomValue < sampleRate
  );
}

const safeSurface =
  /^\/(?:|app\/(?:account|portfolio|workspaces\/:workspace(?:\/:view)?)|(?:forgot-password|invite|onboarding|privacy|reset-password|select-organization|sign-in|sign-up|terms|verify-email)|:unmatched)$/u;

export function normalizedWebVitalSurface(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "app" && parts[1] === "workspaces")
    return parts.length > 3
      ? "/app/workspaces/:workspace/:view"
      : "/app/workspaces/:workspace";
  if (
    parts[0] === "app" &&
    new Set(["account", "portfolio"]).has(parts[1] ?? "")
  )
    return `/app/${parts[1]}`;
  const publicSurface = new Set([
    "forgot-password",
    "invite",
    "onboarding",
    "privacy",
    "reset-password",
    "select-organization",
    "sign-in",
    "sign-up",
    "terms",
    "verify-email",
  ]);
  if (!parts[0]) return "/";
  return publicSurface.has(parts[0]) ? `/${parts[0]}` : "/:unmatched";
}

export function parseWebVitalReport(value: unknown): WebVitalReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!webVitalNames.includes(input.name as WebVitalReport["name"]))
    return null;
  if (!webVitalRatings.includes(input.rating as WebVitalReport["rating"]))
    return null;
  if (
    !webVitalNavigationTypes.includes(
      input.navigationType as WebVitalReport["navigationType"],
    )
  )
    return null;
  if (
    typeof input.value !== "number" ||
    !Number.isFinite(input.value) ||
    input.value < 0 ||
    typeof input.delta !== "number" ||
    !Number.isFinite(input.delta) ||
    input.delta < 0
  )
    return null;
  if (typeof input.surface !== "string" || !safeSurface.test(input.surface))
    return null;
  return {
    name: input.name as WebVitalReport["name"],
    value: input.value,
    delta: input.delta,
    rating: input.rating as WebVitalReport["rating"],
    navigationType: input.navigationType as WebVitalReport["navigationType"],
    surface: input.surface,
  };
}
