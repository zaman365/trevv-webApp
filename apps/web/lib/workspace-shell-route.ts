import { isWorkspaceView } from "./workspace-routes";

export type ActiveWorkspacePage =
  | "home"
  | "portfolio"
  | "dashboard"
  | "calendar"
  | "attention"
  | "myWork"
  | "inbox"
  | "mail"
  | "messages"
  | "waiting"
  | "decisions"
  | "approvals"
  | "ideas"
  | "teams"
  | "reviews"
  | "notifications"
  | "search"
  | "templates"
  | "platform"
  | "settings"
  | "workspace";
export interface WorkspaceShellRoute {
  active: ActiveWorkspacePage;
  workspaceSlug?: string;
  requiresRecords: boolean;
}
/** Preserve standalone previews/404s; only established chrome-owned routes enter. */
export function workspaceShellRoute(
  pathname: string,
): WorkspaceShellRoute | null {
  const path = pathname.split(/[?#]/, 1)[0]?.replace(/\/$/, "") ?? "";
  if (path === "/app/portfolio")
    return { active: "portfolio", requiresRecords: true };
  if (path === "/app/my-work")
    return { active: "myWork", requiresRecords: true };
  if (path === "/app/mail") return { active: "mail", requiresRecords: false };
  if (path === "/app/system/admin")
    return { active: "platform", requiresRecords: false };
  if (
    [
      "/app/account/sessions",
      "/app/account/privacy",
      "/app/account/invitations",
    ].includes(path)
  ) {
    return { active: "settings", requiresRecords: false };
  }
  const match = /^\/app\/workspaces\/([^/]+)(?:\/(.+))?$/.exec(path);
  if (!match?.[1]) return null;
  let workspaceSlug: string;
  try {
    workspaceSlug = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const view = match[2];
  if (!view || /^boards\/[^/]+$/.test(view))
    return { active: "workspace", workspaceSlug, requiresRecords: true };
  if (view === "settings/import")
    return { active: "settings", workspaceSlug, requiresRecords: true };
  if (!isWorkspaceView(view)) return null;
  return {
    active:
      view === "my-work"
        ? "myWork"
        : view === "blueprints"
          ? "templates"
          : view,
    workspaceSlug,
    requiresRecords: true,
  };
}
