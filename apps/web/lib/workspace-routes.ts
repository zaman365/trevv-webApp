export const workspaceViews = [
  "dashboard",
  "attention",
  "my-work",
  "inbox",
  "messages",
  "decisions",
  "approvals",
  "ideas",
  "reviews",
  "waiting",
  "team",
  "blueprints",
  "notifications",
  "search",
  "settings",
] as const;

export type WorkspaceView = (typeof workspaceViews)[number];

export const portfolioHref = "/app/portfolio";

export function isWorkspaceView(value: string): value is WorkspaceView {
  return workspaceViews.includes(value as WorkspaceView);
}

export function workspaceHref(
  workspaceSlug: string,
  view?: WorkspaceView,
  hash?: string,
) {
  const base = `/app/workspaces/${encodeURIComponent(workspaceSlug)}`;
  const path = view ? `${base}/${view}` : base;
  if (!hash) return path;
  return `${path}#${hash.replace(/^#/, "")}`;
}

export function workspaceScopeHref(
  workspaceSlug: string | undefined,
  view?: WorkspaceView,
  hash?: string,
) {
  return workspaceSlug
    ? workspaceHref(workspaceSlug, view, hash)
    : portfolioHref;
}
