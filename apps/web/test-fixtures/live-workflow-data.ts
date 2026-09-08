import type { BoardDto, WorkItemDto } from "@founderhq/api-contract";
import type { LiveAppDataSnapshot } from "../lib/live-app-data";

export const timestamp = "2026-09-07T10:00:00.000Z";
export const board: BoardDto = {
  id: "board-one",
  workspaceId: "workspace-one",
  name: "Execution",
  description: "",
  visibility: "organization",
  progressMode: "task_completion",
  ordering: 0,
  versionTag: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
};
export const item: WorkItemDto = {
  id: "item-one",
  workspaceId: board.workspaceId,
  boardId: board.id,
  title: "Ship the launch",
  description: "",
  type: "task",
  priority: "normal",
  status: "not_started",
  assignees: [],
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
export const snapshot: LiveAppDataSnapshot = {
  portfolios: [
    {
      id: "portfolio-one",
      organizationId: "org-one",
      name: "Company",
      slug: "company",
      description: "",
      isDefault: true,
    },
  ],
  workspaces: [
    {
      id: board.workspaceId,
      portfolioId: "portfolio-one",
      name: "Launch",
      slug: "launch",
      description: "",
      icon: "L",
      accent: "#5555aa",
      type: "business",
      stage: "idea",
      health: "on_track",
      healthNote: "",
      priority: "",
      metrics: [],
      versionTag: timestamp,
      updatedAt: timestamp,
    },
  ],
  items: [item],
  attention: [],
  waiting: [],
  refreshedAt: timestamp,
  complete: true,
};
export const session = {
  demo: false,
  organization: {
    id: "org-one",
    name: "Company",
    role: "owner",
    timezone: "Europe/Berlin",
  },
  user: {
    id: "user-one",
    name: "Owner",
    email: "owner@example.test",
    role: "owner",
  },
  availableOrganizations: [],
  managedWorkspaceIds: [],
};
export const members = [
  session.user,
  { id: "user-two", name: "Teammate", email: "teammate@example.test" },
].map((user) => ({
  organizationId: session.organization.id,
  user,
  role: "member",
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}));
