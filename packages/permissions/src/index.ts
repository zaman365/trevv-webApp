export type Role =
  "owner" | "admin" | "workspace_lead" | "member" | "guest" | "viewer";
export type Action =
  | "read"
  | "create"
  | "update"
  | "comment"
  | "send"
  | "react"
  | "mark_read"
  | "manage_members"
  | "manage_participants"
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
  | "team"
  | "conversation"
  | "message"
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

export type CollaborationRoomKind =
  "workspace" | "team" | "direct" | "external";
export type CollaborationVisibility =
  "organization" | "private" | "guest_scoped";

export interface CollaborationScope extends ResourceScope {
  workspaceId: string;
  kind: CollaborationRoomKind;
  visibility: CollaborationVisibility;
  activeParticipant: boolean;
  activeTeamMember?: boolean;
  teamLead?: boolean;
  conversationOwner?: boolean;
  messageSender?: boolean;
  responseOwner?: boolean;
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

/**
 * Collaboration is deliberately stricter than the generic organization
 * policy. In particular, an owner or administrator cannot read private,
 * Team, direct, or external message content without being a participant.
 * Team feature presets are intentionally absent from this input: they may
 * shape product defaults, but they never grant data access.
 */
export function canCollaborate(
  context: AccessContext,
  action: Action,
  resource: Extract<Resource, "team" | "conversation" | "message">,
  scope: CollaborationScope,
): boolean {
  if (context.organizationId !== scope.organizationId) return false;
  if (!context.accessibleWorkspaceIds.has(scope.workspaceId)) return false;

  const organizationManager =
    context.role === "owner" || context.role === "admin";
  const workspaceManager =
    organizationManager ||
    (context.role === "workspace_lead" &&
      context.managedWorkspaceIds.has(scope.workspaceId));

  if (resource === "team") {
    if (action === "read") return context.role !== "guest";
    if (context.role === "guest" || context.role === "viewer") return false;
    if (action === "create" || action === "delete") return workspaceManager;
    if (
      action === "update" ||
      action === "manage_members" ||
      action === "manage_settings"
    )
      return workspaceManager || Boolean(scope.teamLead);
    return false;
  }

  if (
    context.role === "guest" &&
    (scope.kind !== "external" || scope.visibility !== "guest_scoped")
  )
    return false;

  const participantOnly =
    scope.kind !== "workspace" || scope.visibility !== "organization";
  const canRead =
    scope.kind === "team"
      ? Boolean(scope.activeParticipant && scope.activeTeamMember)
      : participantOnly
        ? scope.activeParticipant
        : context.role === "guest"
          ? scope.activeParticipant
          : true;
  if (!canRead) return false;
  if (action === "read" || action === "mark_read") return true;
  if (context.role === "viewer") return false;
  if (action === "send" || action === "comment" || action === "react")
    return true;
  if (action === "create") return workspaceManager || context.role === "member";
  if (action === "manage_participants") {
    if (context.role === "guest") return false;
    if (scope.kind === "team" || scope.kind === "direct") return false;
    return workspaceManager || Boolean(scope.conversationOwner);
  }
  if (resource === "message" && action === "update")
    return (
      workspaceManager ||
      Boolean(scope.conversationOwner) ||
      Boolean(scope.messageSender) ||
      Boolean(scope.responseOwner)
    );
  if (action === "update" || action === "delete")
    return workspaceManager || Boolean(scope.conversationOwner);
  return false;
}

export function requireCollaborationAccess(
  context: AccessContext,
  action: Action,
  resource: Extract<Resource, "team" | "conversation" | "message">,
  scope: CollaborationScope,
): void {
  if (!canCollaborate(context, action, resource, scope))
    throw new PermissionError();
}

export class PermissionError extends Error {
  readonly code = "resource_not_found";
  constructor() {
    super("The requested resource is unavailable.");
    this.name = "PermissionError";
  }
}
