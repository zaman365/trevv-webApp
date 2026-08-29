export const demoWorkspaceRegistryCookie = "trevv.demo_workspaces";

const maximumRegisteredWorkspaces = 20;
const workspaceSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

export function isDemoWorkspaceSlug(value: unknown): value is string {
  return typeof value === "string" && workspaceSlugPattern.test(value);
}

export function parseDemoWorkspaceRegistry(
  value: string | undefined,
): string[] {
  if (!value) return [];
  try {
    const decoded = JSON.parse(decodeURIComponent(value)) as unknown;
    if (!Array.isArray(decoded)) return [];
    return Array.from(new Set(decoded.filter(isDemoWorkspaceSlug))).slice(
      0,
      maximumRegisteredWorkspaces,
    );
  } catch {
    return [];
  }
}

export function serializeDemoWorkspaceRegistry(slugs: readonly string[]) {
  return encodeURIComponent(
    JSON.stringify(
      Array.from(new Set(slugs.filter(isDemoWorkspaceSlug))).slice(
        0,
        maximumRegisteredWorkspaces,
      ),
    ),
  );
}
