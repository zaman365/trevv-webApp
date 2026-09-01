import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignSinglePlatformOwner,
  authSessions,
  authUserMappings,
  authUsers,
  createDatabase,
  createPlatformScope,
  createPostgresRepositories,
  invitations,
  memberships,
  organizations,
  platformAuditEvents,
  resolvePlatformOwnerRole,
  stagingDatabaseComment,
  users,
} from "../src/index.js";
import {
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "./database-test-helper.js";

let temporary: TemporaryDatabase;
let connection: ReturnType<typeof createDatabase>;
let databaseName: string;

const now = new Date("2026-09-01T10:00:00.000Z");
const owner = {
  authId: "auth-platform-owner",
  appId: "user-platform-owner",
  email: "owner@platform.test",
};
const member = {
  authId: "auth-platform-member",
  appId: "user-platform-member",
  email: "member@platform.test",
};

beforeAll(async () => {
  temporary = await createTemporaryDatabase(undefined, {
    namePrefix: "trevv_platform_staging",
  });
  databaseName = decodeURIComponent(new URL(temporary.url).pathname.slice(1));
  await migrateCurrent(temporary.url);
  const raw = postgres(temporary.url, { max: 1, prepare: false });
  try {
    await raw.unsafe(
      `comment on database "${databaseName}" is '${stagingDatabaseComment}'`,
    );
  } finally {
    await raw.end();
  }
  connection = createDatabase(temporary.url);
  await connection.db.insert(organizations).values({
    id: "org-platform",
    name: "Platform Company",
    slug: "platform-company",
  });
  await connection.db.insert(users).values([
    { id: owner.appId, email: owner.email, name: "Platform Owner" },
    { id: member.appId, email: member.email, name: "Platform Member" },
  ]);
  await connection.db.insert(memberships).values([
    {
      organizationId: "org-platform",
      userId: owner.appId,
      role: "owner",
    },
    {
      organizationId: "org-platform",
      userId: member.appId,
      role: "member",
    },
  ]);
  await connection.db.insert(authUsers).values([
    {
      id: owner.authId,
      email: owner.email,
      name: "Platform Owner",
      emailVerified: true,
    },
    {
      id: member.authId,
      email: member.email,
      name: "Platform Member",
      emailVerified: false,
    },
  ]);
  await connection.db.insert(authUserMappings).values([
    { authUserId: owner.authId, appUserId: owner.appId },
    { authUserId: member.authId, appUserId: member.appId },
  ]);
  await connection.db.insert(authSessions).values([
    {
      id: "session-owner-current",
      token: "token-owner-current",
      userId: owner.authId,
      expiresAt: new Date("2026-09-10T10:00:00.000Z"),
    },
    {
      id: "session-member-one",
      token: "token-member-one",
      userId: member.authId,
      expiresAt: new Date("2026-09-10T10:00:00.000Z"),
    },
    {
      id: "session-member-two",
      token: "token-member-two",
      userId: member.authId,
      expiresAt: new Date("2026-09-11T10:00:00.000Z"),
    },
  ]);
  await connection.db.insert(invitations).values({
    id: "invitation-platform",
    organizationId: "org-platform",
    email: "invited@platform.test",
    role: "member",
    tokenHash: "a".repeat(64),
    invitedByUserId: owner.appId,
    expiresAt: new Date("2026-09-08T10:00:00.000Z"),
    deliveryStatus: "failed",
    deliveryErrorCode: "smtp_unavailable",
    sendCount: 2,
  });
}, 120_000);

afterAll(async () => {
  await connection?.close();
  await temporary?.drop();
}, 120_000);

describe("single platform-owner repositories", () => {
  it("assigns exactly one verified organization owner and resolves the role", async () => {
    const input = {
      email: owner.email.toUpperCase(),
      confirmation: `platform-owner:${databaseName}:${owner.email}`,
      now,
    };
    await expect(
      assignSinglePlatformOwner(connection.db, input),
    ).resolves.toMatchObject({
      status: "assigned",
      appUserId: owner.appId,
      email: owner.email,
    });
    await expect(
      assignSinglePlatformOwner(connection.db, input),
    ).resolves.toMatchObject({
      status: "no_op",
    });
    await expect(
      resolvePlatformOwnerRole(connection.db, owner.appId),
    ).resolves.toBe("owner");
    await expect(
      resolvePlatformOwnerRole(connection.db, member.appId),
    ).resolves.toBeNull();
  });

  it("fails closed for nonowners and returns only redacted operational projections", async () => {
    const repositories = createPostgresRepositories(connection.db);
    await expect(
      repositories
        .forPlatform(
          createPlatformScope({
            actorUserId: member.appId,
            requestId: randomUUID(),
          }),
        )
        .dashboard(now),
    ).rejects.toThrow(/unavailable/u);

    const dashboard = await repositories
      .forPlatform(
        createPlatformScope({
          actorUserId: owner.appId,
          requestId: randomUUID(),
        }),
      )
      .dashboard(now);
    expect(dashboard.summary).toMatchObject({
      organizations: 1,
      users: 2,
      verifiedUsers: 1,
      activeSessions: 3,
      pendingInvitations: 1,
      failedInvitationDeliveries: 1,
    });
    expect(dashboard.invitations[0]).toMatchObject({
      email: "invited@platform.test",
      deliveryStatus: "failed",
      deliveryErrorCode: "smtp_unavailable",
    });
    expect(dashboard.invitations[0]).not.toHaveProperty("tokenHash");
    expect(dashboard.users[0]).not.toHaveProperty("token");
  });

  it("revokes target sessions, preserves the owner session, and records an audit event", async () => {
    const result = await createPostgresRepositories(connection.db)
      .forPlatform(
        createPlatformScope({
          actorUserId: owner.appId,
          requestId: "request-revoke-member-sessions",
        }),
      )
      .revokeUserSessions(member.authId, "session-owner-current", now);
    expect(result).toEqual({
      revokedSessions: 2,
      preservedCurrentSession: true,
    });
    await expect(connection.db.$count(authSessions)).resolves.toBe(1);
    const audit = await connection.db.select().from(platformAuditEvents);
    expect(audit.map((event) => event.action)).toContain(
      "user_sessions.revoked",
    );
  });
});
