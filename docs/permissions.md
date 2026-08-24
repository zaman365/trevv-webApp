# Permissions

Authorization is a server-side domain policy. The UI may simplify controls but never establishes access.

| Role | Scope |
| --- | --- |
| Owner | Full organization, security, export, deletion, ownership transfer |
| Admin | Organization settings, members, templates, integrations; no implicit ownership transfer |
| Hub Lead | Assigned Hub management, Hub team, updates, boards, statuses, and copied templates |
| Member | Create/edit/comment in assigned Hubs subject to board permissions |
| Guest | Explicitly shared resources only; no directory, unrelated Hub names, global metrics, or broad search |
| Viewer | Read-only access to explicitly shared resources |

Every use case verifies membership, organization scope, resource scope, and action. Unauthorized identifiers return a non-enumerating not-found/forbidden envelope. Search, notifications, activity, exports, and aggregates apply the same accessible-resource predicate. Permission changes create audit events.

