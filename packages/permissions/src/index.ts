export type Role =
  "owner" | "admin" | "hub_lead" | "member" | "guest" | "viewer";
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
  | "hub"
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
  accessibleHubIds: ReadonlySet<string>;
  managedHubIds: ReadonlySet<string>;
}

export interface ResourceScope {
  organizationId: string;
  hubId?: string;
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
    context.role === "hub_lead" &&
    scope.hubId &&
    context.managedHubIds.has(scope.hubId) &&
    action === "manage_members" &&
    resource === "hub"
  )
    return true;
  if (orgManagement.has(action)) return false;
  if (context.role === "guest" || context.role === "viewer") {
    if (
      !scope.explicitlyShared ||
      !scope.hubId ||
      !context.accessibleHubIds.has(scope.hubId)
    )
      return false;
    return context.role === "guest"
      ? ["read", "comment"].includes(action)
      : action === "read";
  }
  if (
    resource === "portfolio" ||
    resource === "search" ||
    resource === "notification"
  )
    return action === "read";
  if (!scope.hubId || !context.accessibleHubIds.has(scope.hubId)) return false;
  if (context.role === "hub_lead" && context.managedHubIds.has(scope.hubId))
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
