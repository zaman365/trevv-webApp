import { workspaceHref, type WorkspaceView } from "./workspace-routes";

/**
 * Learning guides describe a destination by its module, not by a URL.
 * Modules are workspace-scoped, so these keys are resolved against the
 * workspace the reader is currently in.
 */
export const workspaceLearningRoutes: Record<string, WorkspaceView> = {
  "/app/attention": "attention",
  "/app/approvals": "approvals",
  "/app/blueprints": "blueprints",
  "/app/dashboard": "dashboard",
  "/app/decisions": "decisions",
  "/app/ideas": "ideas",
  "/app/inbox": "inbox",
  "/app/my-work": "my-work",
  "/app/notifications": "notifications",
  "/app/reviews": "reviews",
  "/app/search": "search",
  "/app/team": "team",
  "/app/waiting": "waiting",
};

/** Routes a guide may point at that are not workspace modules. */
export const standaloneLearningRoutes = new Set([
  "/app/portfolio",
  "/app/settings/import",
  "/app/settings/integrations",
]);

export const isResolvableLearningRoute = (route: string) =>
  route in workspaceLearningRoutes || standaloneLearningRoutes.has(route);

/**
 * Resolve a guide's module key to a real route. Without a workspace there
 * is no single destination for a workspace module, so the reader is sent
 * to the portfolio to choose one.
 */
export function resolveLearningRoute(
  route: string | undefined,
  workspaceSlug?: string,
) {
  if (!route) return route;
  const workspaceView = workspaceLearningRoutes[route];

  if (!workspaceSlug) {
    return workspaceView || route.startsWith("/app/settings")
      ? "/app/portfolio"
      : route;
  }

  if (workspaceView) return workspaceHref(workspaceSlug, workspaceView);
  if (route === "/app/settings/import") {
    return `/app/workspaces/${encodeURIComponent(workspaceSlug)}/settings/import`;
  }
  if (route.startsWith("/app/settings/integrations")) {
    const hash = route.split("#")[1];
    return workspaceHref(workspaceSlug, "settings", hash);
  }
  return route;
}
