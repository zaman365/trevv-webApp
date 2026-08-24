import { demoHubs, demoItems } from "@founderhq/core";
import { createDatabase } from "./index.js";
import {
  boards,
  hubs,
  memberships,
  organizations,
  users,
  workItems,
} from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required to seed FounderHQ.");
const { db, close } = createDatabase(databaseUrl);

await db
  .insert(organizations)
  .values({ id: "org-demo", name: "FounderHQ Demo", slug: "founderhq-demo" })
  .onConflictDoNothing();
const demoUsers = [
  ["user-owner", "owner@founderhq.local", "Mohammed Zaman", "owner"],
  ["user-admin", "admin@founderhq.local", "Amira Demir", "admin"],
  ["user-lead", "lead@founderhq.local", "Nora Klein", "hub_lead"],
  ["user-member", "member@founderhq.local", "Tim Bauer", "member"],
  ["user-guest", "guest@founderhq.local", "Guest Reviewer", "guest"],
  ["user-viewer", "viewer@founderhq.local", "Demo Viewer", "viewer"],
] as const;
for (const [id, email, name, role] of demoUsers) {
  await db.insert(users).values({ id, email, name }).onConflictDoNothing();
  await db
    .insert(memberships)
    .values({ organizationId: "org-demo", userId: id, role })
    .onConflictDoNothing();
}
for (const [index, hub] of demoHubs.entries()) {
  await db
    .insert(hubs)
    .values({
      id: hub.id,
      organizationId: "org-demo",
      name: hub.name,
      slug: hub.slug,
      type: hub.type,
      accentColor: hub.accent,
      icon: hub.icon,
      visibility: hub.slug === "founder-journey" ? "private" : "organization",
      lifecycleStage: hub.stage,
      health: hub.health,
      healthNote: hub.healthNote,
      leadUserId: "user-owner",
      currentPriority: hub.priority,
      nextMilestoneSummary: hub.nextMilestone.title,
      nextMilestoneDate: hub.nextMilestone.date,
      lastUpdateAt: new Date(`${hub.latestUpdate.date}T12:00:00Z`),
      ordering: index,
    })
    .onConflictDoNothing();
}
const boardIds = [...new Set(demoItems.map((item) => item.boardId))];
for (const [index, boardId] of boardIds.entries()) {
  const item = demoItems.find((candidate) => candidate.boardId === boardId);
  if (!item) continue;
  await db
    .insert(boards)
    .values({
      id: boardId,
      organizationId: "org-demo",
      hubId: item.hubId,
      name: boardId.replace(/^b-/, "").replace(/-/g, " "),
      ordering: index,
    })
    .onConflictDoNothing();
}
for (const [index, item] of demoItems.entries()) {
  await db
    .insert(workItems)
    .values({
      id: item.id,
      organizationId: "org-demo",
      hubId: item.hubId,
      boardId: item.boardId,
      title: item.title,
      itemType: item.type,
      status: item.status,
      priority: item.priority,
      dueDate: item.dueDate,
      creatorId: "user-owner",
      ordering: index,
      typeData: {
        approvalState: item.approvalState,
        decisionState: item.decisionState,
      },
    })
    .onConflictDoNothing();
}
await close();
