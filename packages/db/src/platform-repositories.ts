import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as databaseSchema from "./schema.js";
import {
  authSessions,
  authUserMappings,
  authUsers,
  invitations,
  memberships,
  organizations,
  platformAuditEvents,
  platformOwnerAssignments,
  users,
  workspaces,
} from "./schema.js";
import { stagingDatabaseComment } from "./staging-bootstrap.js";

type TrevvDatabase = PostgresJsDatabase<typeof databaseSchema>;

export interface PlatformScope {
  actorUserId: string;
  requestId: string;
}

declare const platformScopeBrand: unique symbol;

export type TrustedPlatformScope = PlatformScope & {
  readonly [platformScopeBrand]: "TrustedPlatformScope";
};

export interface PlatformDashboardProjection {
  owner: { id: string; name: string; email: string };
  summary: {
    organizations: number;
    users: number;
    verifiedUsers: number;
    activeSessions: number;
    pendingInvitations: number;
    failedInvitationDeliveries: number;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    memberCount: number;
    workspaceCount: number;
    pendingInvitationCount: number;
    createdAt: string;
  }>;
  users: Array<{
    authUserId: string;
    appUserId?: string;
    name: string;
    email: string;
    emailVerified: boolean;
    activeSessionCount: number;
    lastSessionAt?: string;
    memberships: Array<{
      organizationId: string;
      organizationName: string;
      role:
        "owner" | "admin" | "workspace_lead" | "member" | "guest" | "viewer";
      active: boolean;
    }>;
    createdAt: string;
  }>;
  invitations: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    email: string;
    role: "admin" | "workspace_lead" | "member" | "guest" | "viewer";
    status: "pending" | "accepted" | "revoked" | "expired";
    deliveryStatus: "pending" | "sent" | "failed";
    sendCount: number;
    version: number;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    acceptedAt?: string;
    revokedAt?: string;
    lastSentAt?: string;
    deliveryErrorCode?: string;
  }>;
  audit: Array<{
    id: string;
    actorName: string;
    action: string;
    targetType: string;
    targetId: string;
    summary: string;
    createdAt: string;
  }>;
}

export interface PlatformRepositories {
  dashboard(now?: Date): Promise<PlatformDashboardProjection>;
  revokeUserSessions(
    authUserId: string,
    preserveSessionId: string,
    now?: Date,
  ): Promise<{ revokedSessions: number; preservedCurrentSession: boolean }>;
}

export class PlatformAccessError extends Error {
  constructor() {
    super("Platform access is unavailable.");
    this.name = "PlatformAccessError";
  }
}

export function createPlatformScope(
  input: PlatformScope,
): TrustedPlatformScope {
  if (!input.actorUserId.trim() || !input.requestId.trim())
    throw new PlatformAccessError();
  return Object.freeze({ ...input }) as TrustedPlatformScope;
}

export function createPlatformRepositories(
  database: TrevvDatabase,
  scope: TrustedPlatformScope,
): PlatformRepositories {
  return {
    dashboard: (now = new Date()) => loadDashboard(database, scope, now),
    revokeUserSessions: (authUserId, preserveSessionId, now = new Date()) =>
      revokeUserSessions(database, scope, authUserId, preserveSessionId, now),
  };
}

export async function resolvePlatformOwnerRole(
  database: TrevvDatabase,
  appUserId: string,
): Promise<"owner" | null> {
  const [assignment] = await database
    .select({ appUserId: platformOwnerAssignments.appUserId })
    .from(platformOwnerAssignments)
    .where(
      and(
        eq(platformOwnerAssignments.singletonKey, "primary"),
        eq(platformOwnerAssignments.appUserId, appUserId),
      ),
    )
    .limit(1);
  return assignment ? "owner" : null;
}

export async function assignSinglePlatformOwner(
  database: TrevvDatabase,
  input: { email: string; confirmation: string; now?: Date },
): Promise<{
  status: "assigned" | "no_op";
  databaseName: string;
  appUserId: string;
  email: string;
}> {
  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();
  return database.transaction(async (rawTransaction) => {
    const transaction = rawTransaction as unknown as TrevvDatabase;
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('trevv:platform-owner-assignment', 0))`,
    );
    const [inspection] = await transaction.execute<{
      database_name: string;
      database_comment: string | null;
    }>(sql`
      select
        current_database() as database_name,
        shobj_description(oid, 'pg_database') as database_comment
      from pg_database
      where datname = current_database()
    `);
    if (!inspection)
      throw new Error("The platform-owner database is unavailable.");
    if (!/(?:^|[_-])staging(?:[_-]|$)/iu.test(inspection.database_name))
      throw new Error(
        "Platform-owner assignment requires an explicitly marked staging database.",
      );
    if (inspection.database_comment !== stagingDatabaseComment)
      throw new Error(
        `Platform-owner assignment requires ${stagingDatabaseComment}.`,
      );
    const expected = `platform-owner:${inspection.database_name}:${email}`;
    if (input.confirmation !== expected)
      throw new Error(
        "The platform-owner confirmation must bind the staging database and normalized email.",
      );

    const [candidate] = await transaction
      .select({
        authUserId: authUsers.id,
        appUserId: users.id,
        email: authUsers.email,
        emailVerified: authUsers.emailVerified,
      })
      .from(authUsers)
      .innerJoin(
        authUserMappings,
        eq(authUserMappings.authUserId, authUsers.id),
      )
      .innerJoin(
        users,
        and(
          eq(users.id, authUserMappings.appUserId),
          isNull(users.archivedAt),
          isNull(users.deletedAt),
        ),
      )
      .where(sql`lower(${authUsers.email}) = ${email}`)
      .limit(1);
    if (!candidate?.emailVerified)
      throw new Error(
        "The platform owner must be an existing verified application user.",
      );
    const [ownerMembership] = await transaction
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, candidate.appUserId),
          eq(memberships.role, "owner"),
          isNull(memberships.archivedAt),
          isNull(memberships.deletedAt),
        ),
      )
      .limit(1);
    if (!ownerMembership)
      throw new Error(
        "The platform owner must retain an active organization-owner membership.",
      );

    const [existing] = await transaction
      .select()
      .from(platformOwnerAssignments)
      .where(eq(platformOwnerAssignments.singletonKey, "primary"))
      .limit(1)
      .for("update");
    if (existing && existing.appUserId !== candidate.appUserId)
      throw new Error(
        "A different platform owner is already assigned. Automatic transfer is forbidden.",
      );
    if (existing)
      return {
        status: "no_op" as const,
        databaseName: inspection.database_name,
        appUserId: candidate.appUserId,
        email,
      };

    await transaction.insert(platformOwnerAssignments).values({
      singletonKey: "primary",
      appUserId: candidate.appUserId,
      grantedAt: now,
      updatedAt: now,
    });
    await writePlatformAudit(transaction, {
      actorUserId: candidate.appUserId,
      requestId: `platform-owner-assignment:${randomUUID()}`,
      action: "platform_owner.assigned",
      targetType: "application_user",
      targetId: candidate.appUserId,
      summary: "Assigned the single platform owner.",
      now,
    });
    return {
      status: "assigned" as const,
      databaseName: inspection.database_name,
      appUserId: candidate.appUserId,
      email,
    };
  });
}

async function loadDashboard(
  database: TrevvDatabase,
  scope: TrustedPlatformScope,
  now: Date,
): Promise<PlatformDashboardProjection> {
  const owner = await requirePlatformOwner(database, scope);
  const [
    organizationRows,
    membershipRows,
    workspaceRows,
    authUserRows,
    activeSessionRows,
    invitationRows,
    auditRows,
    organizationCount,
    userCount,
    verifiedUserCount,
    activeSessionCount,
    pendingInvitationCount,
    failedDeliveryCount,
  ] = await Promise.all([
    database
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .where(
        and(isNull(organizations.archivedAt), isNull(organizations.deletedAt)),
      )
      .orderBy(asc(organizations.name), asc(organizations.id))
      .limit(250),
    database
      .select({
        appUserId: memberships.userId,
        organizationId: memberships.organizationId,
        organizationName: organizations.name,
        role: memberships.role,
        active: sql<boolean>`${memberships.archivedAt} is null and ${memberships.deletedAt} is null`,
      })
      .from(memberships)
      .innerJoin(
        organizations,
        eq(organizations.id, memberships.organizationId),
      )
      .where(isNull(organizations.deletedAt))
      .orderBy(asc(organizations.name), asc(memberships.userId)),
    database
      .select({ organizationId: workspaces.organizationId })
      .from(workspaces)
      .where(and(isNull(workspaces.archivedAt), isNull(workspaces.deletedAt))),
    database
      .select({
        authUserId: authUsers.id,
        appUserId: users.id,
        name: authUsers.name,
        email: authUsers.email,
        emailVerified: authUsers.emailVerified,
        createdAt: authUsers.createdAt,
      })
      .from(authUsers)
      .leftJoin(authUserMappings, eq(authUserMappings.authUserId, authUsers.id))
      .leftJoin(users, eq(users.id, authUserMappings.appUserId))
      .orderBy(desc(authUsers.createdAt), asc(authUsers.id))
      .limit(500),
    database
      .select({
        id: authSessions.id,
        authUserId: authSessions.userId,
        createdAt: authSessions.createdAt,
      })
      .from(authSessions)
      .where(gt(authSessions.expiresAt, now)),
    database
      .select({ invitation: invitations, organizationName: organizations.name })
      .from(invitations)
      .innerJoin(
        organizations,
        eq(organizations.id, invitations.organizationId),
      )
      .where(
        and(isNull(invitations.deletedAt), isNull(organizations.deletedAt)),
      )
      .orderBy(desc(invitations.createdAt), desc(invitations.id))
      .limit(500),
    database
      .select({ event: platformAuditEvents, actorName: users.name })
      .from(platformAuditEvents)
      .innerJoin(users, eq(users.id, platformAuditEvents.actorUserId))
      .orderBy(
        desc(platformAuditEvents.createdAt),
        desc(platformAuditEvents.id),
      )
      .limit(200),
    database
      .select({ value: count() })
      .from(organizations)
      .where(
        and(isNull(organizations.archivedAt), isNull(organizations.deletedAt)),
      ),
    database.select({ value: count() }).from(authUsers),
    database
      .select({ value: count() })
      .from(authUsers)
      .where(eq(authUsers.emailVerified, true)),
    database
      .select({ value: count() })
      .from(authSessions)
      .where(gt(authSessions.expiresAt, now)),
    database
      .select({ value: count() })
      .from(invitations)
      .where(
        and(
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          isNull(invitations.deletedAt),
          gt(invitations.expiresAt, now),
        ),
      ),
    database
      .select({ value: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.deliveryStatus, "failed"),
          isNull(invitations.deletedAt),
        ),
      ),
  ]);

  const memberCountByOrganization = countBy(
    membershipRows.filter(({ active }) => active),
    ({ organizationId }) => organizationId,
  );
  const workspaceCountByOrganization = countBy(
    workspaceRows,
    ({ organizationId }) => organizationId,
  );
  const pendingInvitationCountByOrganization = countBy(
    invitationRows.filter(
      ({ invitation }) =>
        !invitation.acceptedAt &&
        !invitation.revokedAt &&
        invitation.expiresAt.getTime() > now.getTime(),
    ),
    ({ invitation }) => invitation.organizationId,
  );
  const membershipsByUser = new Map<
    string,
    PlatformDashboardProjection["users"][number]["memberships"]
  >();
  for (const membership of membershipRows) {
    const rows = membershipsByUser.get(membership.appUserId) ?? [];
    rows.push({
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      role: membership.role,
      active: membership.active,
    });
    membershipsByUser.set(membership.appUserId, rows);
  }
  const sessionsByUser = new Map<
    string,
    Array<{ id: string; createdAt: Date }>
  >();
  for (const session of activeSessionRows) {
    const rows = sessionsByUser.get(session.authUserId) ?? [];
    rows.push({ id: session.id, createdAt: session.createdAt });
    sessionsByUser.set(session.authUserId, rows);
  }

  return {
    owner,
    summary: {
      organizations: numericCount(organizationCount),
      users: numericCount(userCount),
      verifiedUsers: numericCount(verifiedUserCount),
      activeSessions: numericCount(activeSessionCount),
      pendingInvitations: numericCount(pendingInvitationCount),
      failedInvitationDeliveries: numericCount(failedDeliveryCount),
    },
    organizations: organizationRows.map((organization) => ({
      ...organization,
      memberCount: memberCountByOrganization.get(organization.id) ?? 0,
      workspaceCount: workspaceCountByOrganization.get(organization.id) ?? 0,
      pendingInvitationCount:
        pendingInvitationCountByOrganization.get(organization.id) ?? 0,
      createdAt: organization.createdAt.toISOString(),
    })),
    users: authUserRows.map((user) => {
      const sessions = sessionsByUser.get(user.authUserId) ?? [];
      const lastSessionAt = sessions.reduce<Date | undefined>(
        (latest, session) =>
          !latest || session.createdAt > latest ? session.createdAt : latest,
        undefined,
      );
      return {
        authUserId: user.authUserId,
        ...(user.appUserId ? { appUserId: user.appUserId } : {}),
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        activeSessionCount: sessions.length,
        ...(lastSessionAt
          ? { lastSessionAt: lastSessionAt.toISOString() }
          : {}),
        memberships: user.appUserId
          ? (membershipsByUser.get(user.appUserId) ?? [])
          : [],
        createdAt: user.createdAt.toISOString(),
      };
    }),
    invitations: invitationRows.map(({ invitation, organizationName }) => ({
      id: invitation.id,
      organizationId: invitation.organizationId,
      organizationName,
      email: invitation.email,
      role: invitation.role === "owner" ? "admin" : invitation.role,
      status: invitation.acceptedAt
        ? "accepted"
        : invitation.revokedAt
          ? "revoked"
          : invitation.expiresAt.getTime() <= now.getTime()
            ? "expired"
            : "pending",
      deliveryStatus: invitation.deliveryStatus,
      sendCount: invitation.sendCount,
      version: invitation.version,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString(),
      ...(invitation.acceptedAt
        ? { acceptedAt: invitation.acceptedAt.toISOString() }
        : {}),
      ...(invitation.revokedAt
        ? { revokedAt: invitation.revokedAt.toISOString() }
        : {}),
      ...(invitation.lastSentAt
        ? { lastSentAt: invitation.lastSentAt.toISOString() }
        : {}),
      ...(invitation.deliveryErrorCode
        ? { deliveryErrorCode: invitation.deliveryErrorCode }
        : {}),
    })),
    audit: auditRows.map(({ event, actorName }) => ({
      id: event.id,
      actorName,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      summary: auditSummary(event.payload, event.action),
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

async function revokeUserSessions(
  database: TrevvDatabase,
  scope: TrustedPlatformScope,
  authUserId: string,
  preserveSessionId: string,
  now: Date,
) {
  if (!authUserId.trim() || !preserveSessionId.trim())
    throw new PlatformAccessError();
  return database.transaction(async (rawTransaction) => {
    const transaction = rawTransaction as unknown as TrevvDatabase;
    await requirePlatformOwner(transaction, scope);
    const [target] = await transaction
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.id, authUserId))
      .limit(1);
    if (!target) throw new PlatformAccessError();
    const revoked = await transaction
      .delete(authSessions)
      .where(
        and(
          eq(authSessions.userId, authUserId),
          ne(authSessions.id, preserveSessionId),
        ),
      )
      .returning({ id: authSessions.id });
    await writePlatformAudit(transaction, {
      actorUserId: scope.actorUserId,
      requestId: scope.requestId,
      action: "user_sessions.revoked",
      targetType: "auth_user",
      targetId: authUserId,
      summary: `Revoked ${revoked.length} session${revoked.length === 1 ? "" : "s"}; preserved the current platform-owner session.`,
      now,
    });
    return {
      revokedSessions: revoked.length,
      preservedCurrentSession: true,
    };
  });
}

async function requirePlatformOwner(
  database: TrevvDatabase,
  scope: TrustedPlatformScope,
) {
  const [owner] = await database
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(platformOwnerAssignments)
    .innerJoin(
      users,
      and(
        eq(users.id, platformOwnerAssignments.appUserId),
        isNull(users.archivedAt),
        isNull(users.deletedAt),
      ),
    )
    .where(
      and(
        eq(platformOwnerAssignments.singletonKey, "primary"),
        eq(platformOwnerAssignments.appUserId, scope.actorUserId),
      ),
    )
    .limit(1);
  if (!owner) throw new PlatformAccessError();
  return owner;
}

async function writePlatformAudit(
  database: TrevvDatabase,
  input: {
    actorUserId: string;
    requestId: string;
    action: string;
    targetType: string;
    targetId: string;
    summary: string;
    now: Date;
  },
) {
  await database.insert(platformAuditEvents).values({
    id: randomUUID(),
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId,
    payload: { summary: input.summary },
    createdAt: input.now,
  });
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/u.test(email) || email.length > 320)
    throw new Error("A valid platform-owner email is required.");
  return email;
}

function numericCount(rows: Array<{ value: number | bigint }>): number {
  return Number(rows[0]?.value ?? 0);
}

function countBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return counts;
}

function auditSummary(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "summary" in payload &&
    typeof (payload as { summary?: unknown }).summary === "string"
  )
    return (payload as { summary: string }).summary.slice(0, 500);
  return fallback.replaceAll("_", " ").replaceAll(".", " · ").slice(0, 500);
}
