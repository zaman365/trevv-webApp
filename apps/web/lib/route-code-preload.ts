import { isWorkspaceView } from "./workspace-routes";
import type { WebRuntimeMode } from "./web-runtime-config";

// Static modules only: never prefetch an authenticated RSC response or API data.
const modules = {
  portfolioLoader: () => import("../components/portfolio-loader"),
  portfolio: () => import("../components/portfolio-experience"),
  livePortfolio: () => import("../components/live-portfolio-experience"),
  overviewLoader: () => import("../components/workspace-overview-loader"),
  overview: () => import("../components/workspace-overview"),
  liveOverview: () => import("../components/live-workspace-overview"),
  moduleLoader: () => import("../components/workspace-module-loader"),
  boardLoader: () => import("../components/board-loader"),
  board: () => import("../components/board-experience"),
  liveBoard: () => import("../components/live-board-experience"),
  calendar: () => import("../components/calendar-experience"),
  dashboard: () => import("../components/dashboard-experience"),
  management: () => import("../components/management-experience"),
  focus: () => import("../components/focus-experience"),
  settings: () => import("../components/settings-experience"),
  messages: () => import("../components/demo-messaging-experience"),
  liveMessages: () => import("../components/live-messaging-workspace"),
  liveTeams: () => import("../components/live-team-workflow"),
  liveWork: () => import("../components/live-work-views"),
  stakeholder: () => import("../components/stakeholder-experience"),
  mail: () => import("../components/email-inbox-workflow"),
  sessions: () => import("../components/session-management"),
  privacy: () => import("../components/privacy-center"),
  invitations: () => import("../components/invitation-management"),
  admin: () => import("../components/platform-admin"),
};
type ModuleKey = keyof typeof modules;
const pending = new Map<ModuleKey, Promise<unknown>>();

export function isAppPath(href: string) {
  const pathname = href.split(/[?#]/, 1)[0] ?? "";
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function routeCodeModules(
  href: string,
  mode: WebRuntimeMode,
): ModuleKey[] {
  const pathname = href.split(/[?#]/, 1)[0]?.replace(/\/$/, "");
  const live = mode === "live";
  if (pathname === "/app/portfolio")
    return ["portfolioLoader", live ? "livePortfolio" : "portfolio"];
  const pages: Record<string, ModuleKey> = {
    "/app/mail": "mail",
    "/app/account/sessions": "sessions",
    "/app/account/privacy": "privacy",
    "/app/account/invitations": "invitations",
    "/app/system/admin": "admin",
  };
  if (pathname && pages[pathname]) return [pages[pathname]];
  const match = /^\/app\/workspaces\/[^/]+(?:\/(.+))?$/.exec(pathname ?? "");
  if (!match) return [];
  const view = match[1];
  if (!view) return ["overviewLoader", live ? "liveOverview" : "overview"];
  if (/^boards\/[^/]+$/.test(view))
    return ["boardLoader", live ? "liveBoard" : "board"];
  if (view === "settings/import") return ["management"];
  if (view === "stakeholder") return ["stakeholder"];
  if (!isWorkspaceView(view)) return [];
  let component: ModuleKey;
  if (view === "calendar") component = "calendar";
  else if (live)
    component =
      view === "dashboard"
        ? "liveOverview"
        : view === "messages"
          ? "liveMessages"
          : view === "teams"
            ? "liveTeams"
            : "liveWork";
  else if (view === "dashboard") component = "dashboard";
  else if (view === "messages") component = "messages";
  else if (view === "settings") component = "settings";
  else if (
    ["my-work", "inbox", "decisions", "approvals", "search"].includes(view)
  )
    component = "focus";
  else component = "management";
  return ["moduleLoader", component];
}

export function preloadRouteCode(href: string, mode: WebRuntimeMode) {
  return Promise.all(
    routeCodeModules(href, mode).map((key) => {
      let promise = pending.get(key);
      if (!promise) {
        promise = modules[key]().catch(() => {
          pending.delete(key);
        });
        pending.set(key, promise);
      }
      return promise;
    }),
  );
}
