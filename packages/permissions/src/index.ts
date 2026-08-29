export type Role =
  "owner" | "admin" | "workspace_lead" | "member" | "guest" | "viewer";
export type Action =
  | "read"
  | "create"
  | "update"
  | "comment"
  | "manage_members"
  | "manage_settings"
  | "export"
  | "delete";
export type Resource =
  | "portfolio"
  | "workspace"
  | "board"
  | "item"
  | "comment"
  | "search"
  | "notification"
  | "external_resource"
  | "settings";

export interface AccessContext {
  userId: string;
  organizationId: string;
  role: Role;
  accessiblePortfolioIds: ReadonlySet<string>;
  managedPortfolioIds: ReadonlySet<string>;
  accessibleWorkspaceIds: ReadonlySet<string>;
  managedWorkspaceIds: ReadonlySet<string>;
}

export interface ResourceScope {
  organizationId: string;
  portfolioId?: string;
  workspaceId?: string;
  explicitlyShared?: boolean;
}

const orgManagement = new Set<Action>([
  "manage_members",
  "manage_settings",
  "export",
  "delete",
]);

export function can(
  context: AccessContext,
  action: Action,
  resource: Resource,
  scope: ResourceScope,
): boolean {
  if (context.organizationId !== scope.organizationId) return false;
  if (context.role === "owner") return true;
  if (context.role === "admin") return action !== "delete";
  if (
    context.role === "workspace_lead" &&
    scope.workspaceId &&
    context.managedWorkspaceIds.has(scope.workspaceId) &&
    action === "manage_members" &&
    resource === "workspace"
  )
    return true;
  if (orgManagement.has(action)) return false;
  if (context.role === "guest" || context.role === "viewer") {
    if (
      !scope.explicitlyShared ||
      !scope.workspaceId ||
      !context.accessibleWorkspaceIds.has(scope.workspaceId)
    )
      return false;
    return context.role === "guest"
      ? ["read", "comment"].includes(action)
      : action === "read";
  }
  if (resource === "portfolio")
    return Boolean(
      action === "read" &&
      scope.portfolioId &&
      context.accessiblePortfolioIds.has(scope.portfolioId),
    );
  if (resource === "search" || resource === "notification")
    return action === "read";
  if (
    !scope.workspaceId ||
    !context.accessibleWorkspaceIds.has(scope.workspaceId)
  )
    return false;
  if (
    context.role === "workspace_lead" &&
    context.managedWorkspaceIds.has(scope.workspaceId)
  )
    return true;
  return ["read", "create", "update", "comment"].includes(action);
}

export function requireAccess(
  context: AccessContext,
  action: Action,
  resource: Resource,
  scope: ResourceScope,
): void {
  if (!can(context, action, resource, scope)) throw new PermissionError();
}

export class PermissionError extends Error {
  readonly code = "resource_not_found";
  constructor() {
    super("The requested resource is unavailable.");
    this.name = "PermissionError";
  }
}
