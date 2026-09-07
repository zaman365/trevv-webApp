import { workspaceViews } from "./workspace-routes";

export const webVitalNames = [
  "CLS",
  "FCP",
  "FID",
  "INP",
  "LCP",
  "TTFB",
  "ROUTE_COMMIT",
  "ROUTE_READY",
] as const;
export const webVitalRatings = ["good", "needs-improvement", "poor"] as const;
export const webVitalNavigationTypes = [
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
  "soft-navigate",
] as const;

export interface WebVitalReport {
  name: (typeof webVitalNames)[number];
  value: number;
  delta: number;
  rating: (typeof webVitalRatings)[number];
  navigationType: (typeof webVitalNavigationTypes)[number];
  surface: string;
  device?: "mobile" | "desktop";
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

export function normalizedWebVitalSurface(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "app" && parts[1] === "workspaces") {
    const base = "/app/workspaces/:workspace";
    if (parts.length <= 3) return base;
    if (parts[3] === "boards") return `${base}/boards/:board`;
    if (parts[3] === "settings" && parts[4] === "import")
      return `${base}/settings/import`;
    if (parts[3] === "stakeholder") return `${base}/stakeholder`;
    return (workspaceViews as readonly string[]).includes(parts[3] ?? "")
      ? `${base}/${parts[3]}`
      : `${base}/:view`;
  }
  if (parts[0] === "app" && parts[1] === "account") {
    return ["sessions", "privacy", "invitations"].includes(parts[2] ?? "")
      ? `/app/account/${parts[2]}`
      : "/app/account";
  }
  if (parts[0] === "app" && ["portfolio", "mail"].includes(parts[1] ?? ""))
    return `/app/${parts[1]}`;
  if (parts[0] === "app" && parts[1] === "system" && parts[2] === "admin")
    return "/app/system/admin";
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
  if (
    typeof input.surface !== "string" ||
    normalizedWebVitalSurface(input.surface) !== input.surface
  )
    return null;
  return {
    name: input.name as WebVitalReport["name"],
    value: input.value,
    delta: input.delta,
    rating: input.rating as WebVitalReport["rating"],
    navigationType: input.navigationType as WebVitalReport["navigationType"],
    surface: input.surface,
    ...(input.device === "mobile" || input.device === "desktop"
      ? { device: input.device }
      : {}),
  };
}
