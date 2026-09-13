import { workspaceHref } from "./workspace-routes";

export function personHref(workspaceSlug: string, userId?: string) {
  const root = `${workspaceHref(workspaceSlug)}/people`;
  return userId ? `${root}/${encodeURIComponent(userId)}` : root;
}
