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

export function workspaceDirectoryHref(create = false) {
  return create ? "/app/workspaces?create=workspace" : "/app/workspaces";
}
