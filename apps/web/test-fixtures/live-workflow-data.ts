import type { BoardDto, TeamDto, WorkItemDto } from "@founderhq/api-contract";
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

export const teams: TeamDto[] = [
  {
    id: "team-launch",
    organizationId: session.organization.id,
    portfolioId: "portfolio-one",
    workspaceId: board.workspaceId,
    name: "Launch team",
    purpose: "Bring the launch to customers.",
    preset: "marketing",
    featureCapabilities: ["work", "messages"],
    featurePolicySource: "preset",
    members: members.map((member, index) => ({
      user: { ...member.user, organizationRole: "member" },
      role: index === 0 ? "lead" : "member",
      joinedAt: timestamp,
    })),
    room: {
      conversationId: "room-launch",
      title: "Launch team",
      unreadCount: 3,
    },
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "team-operations",
    organizationId: session.organization.id,
    portfolioId: "portfolio-one",
    workspaceId: board.workspaceId,
    name: "Operations",
    purpose: "Keep delivery running.",
    preset: "operations",
    featureCapabilities: ["work", "messages"],
    featurePolicySource: "preset",
    members: [
      {
        user: { ...session.user, organizationRole: "owner" },
        role: "member",
        joinedAt: timestamp,
      },
    ],
    room: {
      conversationId: "room-operations",
      title: "Operations",
      unreadCount: 0,
    },
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "team-private",
    organizationId: session.organization.id,
    portfolioId: "portfolio-one",
    workspaceId: board.workspaceId,
    name: "Private team",
    purpose: "Plan the next project.",
    preset: "custom",
    featureCapabilities: ["messages"],
    featurePolicySource: "override",
    members: [],
    room: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];
