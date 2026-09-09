import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

type Database = PostgresJsDatabase<typeof schema>;
export type AdministratorRole = "owner" | "operator" | "auditor";
export interface SuperadminScope {
  administratorId: string;
  sessionId: string;
  requestId: string;
}
export type SuperadminDirectory =
  "organizations" | "people" | "invitations" | "administrators" | "audit";
export type DirectoryRow = Record<string, string | number | boolean | null>;
export class SuperadminError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 403 | 404 | 409 = 403,
  ) {
    super(message);
  }
}

export const initialSuperadminEmail = "zaman.ase365@gmail.com";
export const superadminAuditRetentionDays = 180;
export const superadminInvitationTtlMs = 24 * 60 * 60_000;
export function maskSuperadminEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? `${email.slice(0, 1)}•••${email.slice(at)}` : "•••";
}
export function superadminTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function audit(
  db: Database,
  scope: SuperadminScope,
  action: string,
  type: string,
  id: string,
  reason: string,
) {
  return db.insert(schema.superadminAudit).values({
    id: randomUUID(),
    actorId: scope.administratorId,
    action,
    targetType: type,
    targetId: id,
    reason,
    requestId: scope.requestId,
  });
}

async function requireAdministrator(
  db: Database,
  scope: SuperadminScope,
  role: "read" | "operate" | "owner",
  recent: boolean,
) {
  const [actor] = await db.execute<{ role: AdministratorRole }>(sql`
    select u.role from superadmin_user u join superadmin_session s on s."userId" = u.id
    where u.id = ${scope.administratorId} and s.id = ${scope.sessionId}
      and u.disabled = false and u."emailVerified" = true and u."twoFactorEnabled" = true
      and s."expiresAt" > now() and s."assuranceAt" is not null
      and (${!recent} or s."assuranceAt" >= now() - interval '10 minutes')
    for share of u`);
  if (
    !actor ||
    (role === "operate" && actor.role === "auditor") ||
    (role === "owner" && actor.role !== "owner")
  )
    throw new SuperadminError(
      "superadmin_access_denied",
      recent
        ? "Recent authentication and the required administrator role are needed."
        : "Administrator access is unavailable.",
    );
  return actor;
}

export function createSuperadminRepositories(
  db: Database,
  scope: SuperadminScope,
) {
  async function run<T>(
    role: "read" | "operate" | "owner",
    recent: boolean,
    work: (tx: Database) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => {
      const database = tx as unknown as Database;
      // One order for roster locks prevents last-owner check races/deadlocks.
      if (role === "owner")
        await database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('trevv:superadmin-roster', 0))`,
        );
      await requireAdministrator(database, scope, role, recent);
      return work(database);
    });
  }
  return {
    overview: () =>
      run("read", false, async (tx) => {
        const [row] = await tx.execute<{
          organizations: number;
          users: number;
          verifiedUsers: number;
          activeSessions: number;
          pendingInvitations: number;
          failedDeliveries: number;
        }>(sql`
        select
          (select count(*)::int from organizations where deleted_at is null and archived_at is null) as organizations,
          (select count(*)::int from "user") as users,
          (select count(*)::int from "user" where "emailVerified") as "verifiedUsers",
          (select count(*)::int from session where "expiresAt" > now()) as "activeSessions",
          (select count(*)::int from invitations where accepted_at is null and revoked_at is null and deleted_at is null and expires_at > now()) as "pendingInvitations",
          (select count(*)::int from invitations where delivery_status = 'failed' and accepted_at is null and revoked_at is null and deleted_at is null and expires_at > now()) as "failedDeliveries"`);
        await audit(
          tx,
          scope,
          "overview.viewed",
          "platform",
          "overview",
          "Viewed platform operational totals.",
        );
        return { ...row!, auditRetentionDays: superadminAuditRetentionDays };
      }),
    directory: (kind: SuperadminDirectory, page: number, query: string) =>
      run(kind === "administrators" ? "owner" : "read", false, async (tx) => {
        const limit = 25;
        const offset = Math.min(Math.max(0, page), 40_000) * limit;
        const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        const statements: Record<SuperadminDirectory, SQL> = {
          organizations: sql`select o.id, o.name, o.slug, o.created_at as "createdAt",
          (select count(*)::int from memberships m where m.organization_id = o.id and m.archived_at is null and m.deleted_at is null) as "memberCount",
          (select count(*)::int from workspaces w where w.organization_id = o.id and w.archived_at is null and w.deleted_at is null) as "workspaceCount"
          from organizations o where o.archived_at is null and o.deleted_at is null and (o.name ilike ${pattern} or o.slug ilike ${pattern})`,
          people: sql`select u.id, ('Account ' || left(u.id, 8)) as name,
          (left(u.email, 1) || '•••@' || split_part(u.email, '@', 2)) as email,
          u."emailVerified", u."createdAt",
          (select count(*)::int from session s where s."userId" = u.id and s."expiresAt" > now()) as "sessionCount",
          (select count(*)::int from memberships m join auth_user_mappings am on am.app_user_id = m.user_id
            where am.auth_user_id = u.id and m.archived_at is null and m.deleted_at is null) as "organizationCount"
          from "user" u where u.id ilike ${pattern}`,
          invitations: sql`select i.id, o.name as name, (left(i.email, 1) || '•••@' || split_part(i.email, '@', 2)) as email,
          i.role, i.delivery_status as "deliveryStatus", i.created_at as "createdAt", i.expires_at as "expiresAt",
          case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked' when i.expires_at <= now() then 'expired' else 'pending' end as status
          from invitations i join organizations o on o.id = i.organization_id
          where i.deleted_at is null and o.deleted_at is null and o.name ilike ${pattern}`,
          administrators: sql`select id, name, email, role, disabled, "twoFactorEnabled", "createdAt" from superadmin_user
          where name ilike ${pattern} or email ilike ${pattern}`,
          audit: sql`select a.id, a.action as name, a.target_type as "targetType", a.target_id as "targetId", a.reason,
          coalesce(u.name, 'Bootstrap') as actor, a.created_at as "createdAt"
          from superadmin_audit a left join superadmin_user u on u.id = a.actor_id
          where a.created_at >= now() - ${superadminAuditRetentionDays} * interval '1 day'
            and (a.action ilike ${pattern} or a.target_id ilike ${pattern})`,
        };
        const statement = statements[kind];
        const [total] = await tx.execute<{ total: number }>(
          sql`select count(*)::int as total from (${statement}) directory`,
        );
        const rows = await tx.execute<DirectoryRow>(
          sql`select * from (${statement}) directory order by "createdAt" desc, id desc limit ${limit} offset ${offset}`,
        );
        await audit(
          tx,
          scope,
          "directory.viewed",
          "platform",
          kind,
          "Viewed a paginated operational directory.",
        );
        return {
          items: Array.from(rows),
          total: total?.total ?? 0,
          page,
          pageSize: limit,
        };
      }),
    revealPerson: (id: string, reason: string) =>
      run("operate", true, async (tx) => {
        const [person] = await tx.execute<{
          id: string;
          name: string;
          email: string;
        }>(sql`select id, name, email from "user" where id = ${id}`);
        if (!person)
          throw new SuperadminError("not_found", "Account not found.", 404);
        await audit(
          tx,
          scope,
          "person.contact_revealed",
          "customer_account",
          id,
          reason,
        );
        return person;
      }),
    revokeCustomerSessions: (id: string, reason: string) =>
      run("operate", true, async (tx) => {
        const rows = await tx.execute(
          sql`delete from session where "userId" = ${id} returning id`,
        );
        await audit(
          tx,
          scope,
          "person.sessions_revoked",
          "customer_account",
          id,
          reason,
        );
        return { revokedSessions: rows.length };
      }),
    createOrganization: (input: {
      name: string;
      slug: string;
      ownerEmail: string;
      reason: string;
    }) =>
      run("operate", true, async (tx) => {
        const id = randomUUID(),
          invitationId = randomUUID(),
          token = randomBytes(32).toString("base64url");
        const email = input.ownerEmail.trim().toLowerCase();
        await tx
          .insert(schema.organizations)
          .values({ id, name: input.name, slug: input.slug });
        await tx.insert(schema.portfolios).values({
          id: randomUUID(),
          organizationId: id,
          name: "Company",
          slug: "company",
          isDefault: true,
          description: "The default company portfolio.",
        });
        await tx.insert(schema.invitations).values({
          id: invitationId,
          organizationId: id,
          email,
          role: "owner",
          tokenHash: superadminTokenHash(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
          invitedByUserId: null,
          sendCount: 1,
        });
        await audit(
          tx,
          scope,
          "organization.created",
          "organization",
          id,
          input.reason,
        );
        await audit(
          tx,
          scope,
          "organization.owner_invited",
          "invitation",
          invitationId,
          input.reason,
        );
        return { id, invitationId, token, email, organizationName: input.name };
      }),
    resendOrganizationInvitation: (id: string, reason: string) =>
      run("operate", true, async (tx) => {
        const token = randomBytes(32).toString("base64url");
        const [invitation] = await tx.execute<{
          id: string;
          email: string;
          organizationName: string;
        }>(sql`
        update invitations i set token_hash = ${superadminTokenHash(token)}, expires_at = now() + interval '7 days',
          delivery_status = 'pending', delivery_error_code = null, send_count = send_count + 1, version = version + 1, updated_at = now()
        from organizations o where i.id = ${id} and i.organization_id = o.id
          and i.accepted_at is null and i.revoked_at is null and i.deleted_at is null and o.deleted_at is null
          and not exists (select 1 from registration_invitation_claims c where c.invitation_id = i.id)
        returning i.id, i.email, o.name as "organizationName"`);
        if (!invitation)
          throw new SuperadminError(
            "invitation_unavailable",
            "This invitation has already been claimed, accepted or revoked.",
            409,
          );
        await audit(
          tx,
          scope,
          "organization.invitation_resent",
          "invitation",
          id,
          reason,
        );
        return { ...invitation, invitationId: invitation.id, token };
      }),
    revokeOrganizationInvitation: (id: string, reason: string) =>
      run("operate", true, async (tx) => {
        const rows =
          await tx.execute(sql`update invitations set revoked_at = now(), version = version + 1, updated_at = now()
        where id = ${id} and accepted_at is null and revoked_at is null and deleted_at is null returning id`);
        if (!rows.length)
          throw new SuperadminError(
            "invitation_unavailable",
            "Invitation is no longer pending.",
            409,
          );
        await audit(
          tx,
          scope,
          "organization.invitation_revoked",
          "invitation",
          id,
          reason,
        );
        return { ok: true };
      }),
    inviteAdministrator: (
      email: string,
      role: AdministratorRole,
      reason: string,
    ) =>
      run("owner", true, async (tx) => {
        const normalized = email.toLowerCase();
        const [existing] = await tx.execute(
          sql`select id from superadmin_user where lower(email) = ${normalized}`,
        );
        if (existing)
          throw new SuperadminError(
            "administrator_exists",
            "This administrator already has an account. Manage their existing access.",
            409,
          );
        await tx.execute(
          sql`update superadmin_invitations set revoked_at = now() where lower(email) = ${normalized} and accepted_at is null and revoked_at is null`,
        );
        const invitation = await insertAdminInvitation(
          tx,
          normalized,
          role,
          scope.administratorId,
        );
        await audit(
          tx,
          scope,
          "administrator.invited",
          "administrator_invitation",
          invitation.id,
          reason,
        );
        return invitation;
      }),
    administratorInvitations: () =>
      run("owner", false, async (tx) => {
        const rows =
          await tx.execute<DirectoryRow>(sql`select id, email, role, delivery_status as "deliveryStatus", expires_at as "expiresAt"
        from superadmin_invitations where accepted_at is null and revoked_at is null order by "createdAt" desc limit 100`);
        return { items: Array.from(rows) };
      }),
    revokeAdministratorInvitation: (id: string, reason: string) =>
      run("owner", true, async (tx) => {
        await tx.execute(
          sql`update superadmin_invitations set revoked_at = now() where id = ${id} and accepted_at is null`,
        );
        await audit(
          tx,
          scope,
          "administrator.invitation_revoked",
          "administrator_invitation",
          id,
          reason,
        );
        return { ok: true };
      }),
    updateAdministrator: (
      id: string,
      role: AdministratorRole,
      disabled: boolean,
      reason: string,
    ) =>
      run("owner", true, async (tx) => {
        const [target] = await tx.execute<{
          role: AdministratorRole;
          disabled: boolean;
        }>(
          sql`select role, disabled from superadmin_user where id = ${id} for update`,
        );
        if (!target)
          throw new SuperadminError(
            "not_found",
            "Administrator not found.",
            404,
          );
        if (id === scope.administratorId && (disabled || role !== "owner"))
          throw new SuperadminError(
            "self_revocation",
            "Ask another owner to change your own access.",
            409,
          );
        if (
          target.role === "owner" &&
          !target.disabled &&
          (disabled || role !== "owner")
        ) {
          const [owners] = await tx.execute<{ count: number }>(
            sql`select count(*)::int as count from superadmin_user where role = 'owner' and disabled = false`,
          );
          if ((owners?.count ?? 0) <= 1)
            throw new SuperadminError(
              "last_owner",
              "The final active owner must retain access.",
              409,
            );
        }
        await tx.execute(
          sql`update superadmin_user set role = ${role}, disabled = ${disabled}, "updatedAt" = now() where id = ${id}`,
        );
        if (disabled || role !== target.role)
          await tx.execute(
            sql`delete from superadmin_session where "userId" = ${id}`,
          );
        await audit(
          tx,
          scope,
          "administrator.access_updated",
          "administrator",
          id,
          reason,
        );
        return { ok: true };
      }),
    updatePhone: (phone: string | null) =>
      run("read", true, async (tx) => {
        await tx.execute(
          sql`update superadmin_user set "phoneNumber" = ${phone}, "updatedAt" = now() where id = ${scope.administratorId}`,
        );
        await audit(
          tx,
          scope,
          "security.contact_updated",
          "administrator",
          scope.administratorId,
          "Updated optional administrator contact phone; not an authentication factor.",
        );
        return { phoneNumber: phone, phoneVerified: false };
      }),
    sessions: () =>
      run("read", false, async (tx) => {
        const sessions =
          await tx.execute<DirectoryRow>(sql`select id, "createdAt", "expiresAt", (id = ${scope.sessionId}) as current from superadmin_session
        where "userId" = ${scope.administratorId} and "expiresAt" > now() order by "createdAt" desc limit 100`);
        return { items: Array.from(sessions) };
      }),
    revokeOwnSessions: () =>
      run("read", true, async (tx) => {
        const rows = await tx.execute(
          sql`delete from superadmin_session where "userId" = ${scope.administratorId} and id <> ${scope.sessionId} returning id`,
        );
        await audit(
          tx,
          scope,
          "security.sessions_revoked",
          "administrator",
          scope.administratorId,
          "Revoked other administrator sessions.",
        );
        return { revokedSessions: rows.length };
      }),
  };
}

async function insertAdminInvitation(
  db: Database,
  email: string,
  role: AdministratorRole,
  invitedBy: string | null,
) {
  const id = randomUUID(),
    token = randomBytes(32).toString("base64url");
  await db.insert(schema.superadminInvitations).values({
    id,
    email,
    role,
    invitedBy,
    tokenHash: superadminTokenHash(token),
    expiresAt: new Date(Date.now() + superadminInvitationTtlMs),
  });
  return { id, email, token, role };
}

export async function bootstrapSuperadminOwner(db: Database) {
  return db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    await database.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('trevv:superadmin-roster', 0))`,
    );
    const [existing] = await database.execute(
      sql`select id from superadmin_user limit 1`,
    );
    if (existing)
      throw new SuperadminError(
        "already_bootstrapped",
        "Administrator setup has already been completed.",
        409,
      );
    await database.execute(
      sql`update superadmin_invitations set revoked_at = now() where invited_by is null and accepted_at is null and revoked_at is null`,
    );
    const invitation = await insertAdminInvitation(
      database,
      initialSuperadminEmail,
      "owner",
      null,
    );
    await database.insert(schema.superadminAudit).values({
      id: randomUUID(),
      action: "owner.bootstrap_invited",
      targetType: "administrator_invitation",
      targetId: invitation.id,
      reason:
        "Reserved initial owner invitation for the configured platform operator.",
      requestId: randomUUID(),
    });
    return invitation;
  });
}

export async function recordSuperadminInvitationDelivery(
  db: Database,
  kind: "administrator" | "organization",
  id: string,
  token: string,
  sent: boolean,
) {
  const hash = superadminTokenHash(token);
  if (kind === "administrator")
    await db.execute(
      sql`update superadmin_invitations set delivery_status = ${sent ? "sent" : "failed"} where id = ${id} and token_hash = ${hash}`,
    );
  else
    await db.execute(sql`update invitations set delivery_status = ${sent ? "sent" : "failed"}, delivery_attempted_at = now(),
      delivered_at = case when ${sent} then now() else null end,
      last_sent_at = case when ${sent} then now() else null end,
      delivery_error_code = ${sent ? null : "mail_delivery_failed"}, updated_at = now()
      where id = ${id} and token_hash = ${hash} and accepted_at is null and revoked_at is null`);
}

export async function pruneSuperadminRecords(db: Database) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`delete from superadmin_audit where created_at < now() - ${superadminAuditRetentionDays} * interval '1 day'`,
    );
    await tx.execute(
      sql`delete from superadmin_session where "expiresAt" <= now()`,
    );
    await tx.execute(
      sql`delete from superadmin_verification where "expiresAt" <= now()`,
    );
    await tx.execute(
      sql`delete from superadmin_invitations where expires_at < now() - interval '90 days'`,
    );
  });
}
