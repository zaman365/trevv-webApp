/**
 * The remembered workspace selection lives in a cookie rather than
 * localStorage so the server can render the switcher correctly on the
 * first paint. Reading it only after hydration meant the portfolio page
 * shipped "Choose workspace" and then swapped it a frame later.
 */
export const workspaceSelectionCookie = "trevv.workspace";

export interface StoredWorkspaceSelection {
  portfolioId: string;
  projectId?: string | undefined;
}

/** `portfolioId|projectId` — ids are slugs, so no escaping is needed. */
export function serializeWorkspaceSelection(
  selection: StoredWorkspaceSelection,
) {
  return selection.projectId
    ? `${selection.portfolioId}|${selection.projectId}`
    : selection.portfolioId;
}

export function parseWorkspaceSelection(
  raw: string | undefined,
): StoredWorkspaceSelection | undefined {
  if (!raw) return undefined;
  const [portfolioId, projectId] = raw.split("|");
  if (!portfolioId) return undefined;
  return projectId ? { portfolioId, projectId } : { portfolioId };
}

export function writeWorkspaceSelection(
  selection: StoredWorkspaceSelection | null,
) {
  try {
    const value = selection ? serializeWorkspaceSelection(selection) : "";
    const age = selection ? 60 * 60 * 24 * 365 : 0;
    document.cookie = `${workspaceSelectionCookie}=${value}; path=/; max-age=${age}; samesite=lax`;
  } catch {
    // The selection still applies for the current session.
  }
}
