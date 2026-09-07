/** Resource caches always include organization and workspace identity. */
export const workspaceResourceKeys = {
  boards: (organizationId: string, workspaceId: string) =>
    ["workspace-resources", organizationId, workspaceId, "boards"] as const,
  board: (organizationId: string, workspaceId: string, boardId: string) =>
    [
      "workspace-resources",
      organizationId,
      workspaceId,
      "board",
      boardId,
    ] as const,
  itemDetails: (organizationId: string, workspaceId: string, itemId: string) =>
    [
      "workspace-resources",
      organizationId,
      workspaceId,
      "item-details",
      itemId,
    ] as const,
  calendar: (
    organizationId: string,
    workspaceId: string,
    from: string,
    to: string,
  ) =>
    [
      "workspace-resources",
      organizationId,
      workspaceId,
      "calendar",
      from,
      to,
    ] as const,
  operations: (organizationId: string) =>
    ["workspace-resources", organizationId, "operations"] as const,
};
