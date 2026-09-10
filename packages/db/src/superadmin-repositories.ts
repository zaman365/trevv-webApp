import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql, type SQL } from "drizzle-orm";
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

type ContactInput = {
  kind: "primary" | "billing" | "technical" | "security" | "other";
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
};
type ProfileInput = {
  legalName: string;
  website: string;
  industry: string;
  country: string;
  city: string;
  stage: "onboarding" | "established" | "needs_review";
  priority: "standard" | "priority" | "urgent";
  nextReviewAt: string | null;
  version: number;
  reason: string;
};
const defaultProfile = {
  legalName: "",
  website: "",
  industry: "",
  country: "",
  city: "",
  stage: "onboarding" as const,
  priority: "standard" as const,
  nextReviewAt: null,
  version: 0,
};
async function lockOrganization(tx: Database, id: string) {
  const rows = await tx.execute(sql`select id from organizations
    where id = ${id} and deleted_at is null and archived_at is null for update`);
  if (!rows.length)
    throw new SuperadminError("not_found", "Organisation not found.", 404);
}
function contactProjection(
  contact: typeof schema.superadminOrganizationContacts.$inferSelect,
  revealed = false,
) {
  return {
    id: contact.id,
    kind: contact.kind,
    version: contact.version,
    name: revealed ? contact.name : `${contact.name.slice(0, 1)}•••`,
    jobTitle: revealed ? contact.jobTitle : "Protected",
    email: revealed ? contact.email : maskSuperadminEmail(contact.email),
    phone: revealed
      ? contact.phone
      : contact.phone
        ? `•••${contact.phone.slice(-3)}`
        : "",
    updatedAt: contact.updatedAt.toISOString(),
  };
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
          missingContacts: number;
          missingOwners: number;
          reviewsDue: number;
          newOrganizations: number;
        }>(sql`
        select
          (select count(*)::int from organizations where deleted_at is null and archived_at is null) as organizations,
          (select count(*)::int from "user") as users,
          (select count(*)::int from "user" where "emailVerified") as "verifiedUsers",
          (select count(*)::int from session where "expiresAt" > now()) as "activeSessions",
          (select count(*)::int from invitations where accepted_at is null and revoked_at is null and deleted_at is null and expires_at > now()) as "pendingInvitations",
          (select count(*)::int from invitations where delivery_status = 'failed' and accepted_at is null and revoked_at is null and deleted_at is null and expires_at > now()) as "failedDeliveries",
          (select count(*)::int from organizations o where o.deleted_at is null and o.archived_at is null and not exists
            (select 1 from superadmin_organization_contacts c where c.organization_id = o.id and c.kind = 'primary')) as "missingContacts",
          (select count(*)::int from organizations o where o.deleted_at is null and o.archived_at is null and not exists
            (select 1 from memberships m where m.organization_id = o.id and m.role = 'owner' and m.deleted_at is null and m.archived_at is null)) as "missingOwners",
          (select count(*)::int from organizations o join superadmin_organization_profiles p on p.organization_id = o.id
            where o.deleted_at is null and o.archived_at is null and p.next_review_at <= (now() at time zone 'UTC')::date) as "reviewsDue",
          (select count(*)::int from organizations where deleted_at is null and archived_at is null and created_at >= now() - interval '30 days') as "newOrganizations"`);
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
    directory: (
      kind: SuperadminDirectory,
      page: number,
      query: string,
      options: {
        filter?: string;
        organizationId?: string | undefined;
        protectedSearchReason?: string;
      } = {},
    ) =>
      run(
        kind === "administrators"
          ? "owner"
          : options.protectedSearchReason
            ? "operate"
            : "read",
        Boolean(options.protectedSearchReason),
        async (tx) => {
          if (
            options.protectedSearchReason &&
            kind !== "people" &&
            kind !== "invitations"
          )
            throw new SuperadminError(
              "invalid_filter",
              "Contact search is unavailable for this directory.",
              409,
            );
          const limit = 25;
          const offset = Math.min(Math.max(0, page), 40_000) * limit;
          const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
          const statements: Record<SuperadminDirectory, SQL> = {
            organizations: sql`select o.id, o.name, o.slug, o.created_at as "createdAt",
          (select count(*)::int from memberships m where m.organization_id = o.id and m.archived_at is null and m.deleted_at is null) as "memberCount",
          (select count(*)::int from workspaces w where w.organization_id = o.id and w.archived_at is null and w.deleted_at is null) as "workspaceCount",
          (select count(*)::int from memberships m where m.organization_id = o.id and m.role = 'owner' and m.archived_at is null and m.deleted_at is null) as "ownerCount",
          coalesce(p.stage, 'onboarding') as stage, coalesce(p.priority, 'standard') as priority, p.country, p.city, p.next_review_at::text as "nextReviewAt",
          p.next_review_at <= (now() at time zone 'UTC')::date as "reviewDue",
          c.id is not null as "hasContact", coalesce(left(c.name, 1) || '•••', 'Not provided') as "contactName",
          case when c.id is null then null else left(c.email, 1) || '•••@' || split_part(c.email, '@', 2) end as "contactEmail"
          from organizations o left join superadmin_organization_profiles p on p.organization_id = o.id
          left join superadmin_organization_contacts c on c.organization_id = o.id and c.kind = 'primary'  where o.archived_at is null and o.deleted_at is null and (o.name ilike ${pattern} or o.slug ilike ${pattern})`,
            people: sql`select u.id, ('Account ' || left(u.id, 8)) as name,
          (left(u.email, 1) || '•••@' || split_part(u.email, '@', 2)) as email,
          u."emailVerified", u."createdAt",
          (select max(s."createdAt") from session s where s."userId" = u.id) as "lastSignInAt",
          (select m.role::text from memberships m join auth_user_mappings am on am.app_user_id = m.user_id
            where am.auth_user_id = u.id and m.organization_id = ${options.organizationId ?? ""} and m.deleted_at is null and m.archived_at is null limit 1) as "membershipRole",
          (select count(*)::int from session s where s."userId" = u.id and s."expiresAt" > now()) as "sessionCount",
          (select count(*)::int from memberships m join auth_user_mappings am on am.app_user_id = m.user_id
            where am.auth_user_id = u.id and m.archived_at is null and m.deleted_at is null) as "organizationCount"
          , (select string_agg(o.name || ' · ' || m.role::text || case when m.archived_at is not null or m.deleted_at is not null then ' (inactive)' else '' end, '; ' order by o.name, o.id)
             from memberships m join auth_user_mappings am on am.app_user_id = m.user_id join organizations o on o.id = m.organization_id
             where am.auth_user_id = u.id and o.deleted_at is null) as memberships
          from "user" u where (u.id ilike ${pattern}
            or (${Boolean(options.protectedSearchReason)} and (u.name ilike ${pattern} or u.email ilike ${pattern}))
            or exists (select 1 from memberships m join auth_user_mappings am on am.app_user_id = m.user_id join organizations o on o.id = m.organization_id
              where am.auth_user_id = u.id and o.deleted_at is null and (o.name ilike ${pattern} or o.slug ilike ${pattern})))
          and (${!options.organizationId} or exists (select 1 from memberships m join auth_user_mappings am on am.app_user_id = m.user_id
            where am.auth_user_id = u.id and m.organization_id = ${options.organizationId ?? ""} and m.deleted_at is null and m.archived_at is null))`,
            invitations: sql`select i.id, o.name as name, (left(i.email, 1) || '•••@' || split_part(i.email, '@', 2)) as email,
          i.organization_id as "organizationId", i.send_count as "sendCount", i.last_sent_at as "lastSentAt", i.role, i.delivery_error_code as "deliveryErrorCode", (select string_agg(a.workspace_id, ', ' order by a.workspace_id) from invitation_workspace_assignments a where a.invitation_id = i.id and a.organization_id = i.organization_id) as "workspaceIds",
          (select string_agg(a.team_id, ', ' order by a.team_id) from invitation_team_assignments a where a.invitation_id = i.id and a.organization_id = i.organization_id) as "teamIds", i.delivery_status as "deliveryStatus", i.created_at as "createdAt", i.expires_at as "expiresAt",
          case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked' when i.expires_at <= now() then 'expired' else 'pending' end as status
          from invitations i join organizations o on o.id = i.organization_id
          where i.deleted_at is null and o.deleted_at is null and (o.name ilike ${pattern} or i.delivery_status::text ilike ${pattern} or (${Boolean(options.protectedSearchReason)} and i.email ilike ${pattern})) and (${!options.organizationId} or i.organization_id = ${options.organizationId ?? ""})`,
            administrators: sql`select u.id, u.name, u.email, u.role, u.disabled, u."twoFactorEnabled", u."createdAt", u."emailVerified",
          (select count(*)::int from superadmin_passkey p where p."userId" = u.id) as "passkeyCount",
          (select count(*)::int from superadmin_session s where s."userId" = u.id and s."expiresAt" > now()) as "sessionCount",
          (select max(s."createdAt") from superadmin_session s where s."userId" = u.id) as "lastSignInAt"
          from superadmin_user u where u.name ilike ${pattern} or u.email ilike ${pattern}`,
            audit: sql`select a.id, a.action as name, a.target_type as "targetType", a.target_id as "targetId", a.reason,
          coalesce(u.name, 'Bootstrap') as actor, 'superadmin' as source, a.created_at as "createdAt"
          from superadmin_audit a left join superadmin_user u on u.id = a.actor_id
          where a.created_at >= now() - ${superadminAuditRetentionDays} * interval '1 day'
            and (a.action ilike ${pattern} or a.target_id ilike ${pattern})
          union all
          select 'legacy:' || a.id, a.action, a.target_type, a.target_id, case when jsonb_typeof(a.payload->'summary') = 'string' then left(a.payload->>'summary', 500) else 'Platform action recorded.' end,
            coalesce(u.name, 'Former platform owner'), 'legacy', a.created_at
          from platform_audit_events a left join app_users u on u.id = a.actor_user_id
          where a.action ilike ${pattern} or a.target_id ilike ${pattern}`,
          };
          const filters: Record<SuperadminDirectory, Record<string, SQL>> = {
            organizations: {
              missing_contact: sql`not "hasContact"`,
              missing_owner: sql`"ownerCount" = 0`,
              onboarding: sql`stage = 'onboarding'`,
              needs_review: sql`stage = 'needs_review'`,
              review_due: sql`"reviewDue"`,
            },
            people: {
              verified: sql`"emailVerified"`,
              unverified: sql`not "emailVerified"`,
              has_sessions: sql`"sessionCount" > 0`,
              no_organization: sql`"organizationCount" = 0`,
            },
            invitations: {
              pending: sql`status = 'pending'`,
              expired: sql`status = 'expired'`,
              accepted: sql`status = 'accepted'`,
              revoked: sql`status = 'revoked'`,
              delivery_failed: sql`"deliveryStatus" = 'failed' and status = 'pending'`,
            },
            administrators: {
              owner: sql`role = 'owner'`,
              operator: sql`role = 'operator'`,
              auditor: sql`role = 'auditor'`,
              setup_pending: sql`not disabled and (not "twoFactorEnabled" or not "emailVerified")`,
              disabled: sql`disabled`,
            },
            audit: {
              legacy: sql`source = 'legacy'`,
              changes: sql`name not in ('overview.viewed', 'directory.viewed', 'organization.viewed', 'person.contact_revealed', 'organization.contact_revealed', 'invitation.contact_revealed', 'directory.contacts_searched')`,
              contact_access: sql`name in ('person.contact_revealed', 'organization.contact_revealed', 'invitation.contact_revealed', 'directory.contacts_searched')`,
              reads: sql`name in ('overview.viewed', 'directory.viewed', 'organization.viewed')`,
            },
          };
          const filter = options.filter ?? "all";
          if (filter !== "all" && !filters[kind][filter])
            throw new SuperadminError(
              "invalid_filter",
              "Unknown directory filter.",
              409,
            );
          if (
            options.organizationId &&
            kind !== "people" &&
            kind !== "invitations"
          )
            throw new SuperadminError(
              "invalid_filter",
              "Organisation filtering is unavailable for this directory.",
              409,
            );
          const statement = sql`select * from (${statements[kind]}) source where ${filter === "all" ? sql`true` : filters[kind][filter]!}`;
          const [total] = await tx.execute<{ total: number }>(
            sql`select count(*)::int as total from (${statement}) directory`,
          );
          const rows = await tx.execute<DirectoryRow>(
            sql`select * from (${statement}) directory order by "createdAt" desc, id desc limit ${limit} offset ${offset}`,
          );
          await audit(
            tx,
            scope,
            options.protectedSearchReason
              ? "directory.contacts_searched"
              : "directory.viewed",
            "platform",
            kind,
            options.protectedSearchReason ??
              "Viewed a paginated operational directory.",
          );
          return {
            items: Array.from(rows),
            total: total?.total ?? 0,
            page,
            pageSize: limit,
          };
        },
      ),
    organization: (id: string) =>
      run("read", false, async (tx) => {
        const [organization] =
          await tx.execute<DirectoryRow>(sql`select o.id, o.name, o.slug, o.locale, o.timezone, o.created_at as "createdAt",
        (select count(*)::int from memberships m where m.organization_id = o.id and m.archived_at is null and m.deleted_at is null) as "memberCount",
        (select count(*)::int from memberships m where m.organization_id = o.id and m.role = 'owner' and m.archived_at is null and m.deleted_at is null) as "ownerCount",
        (select count(*)::int from workspaces w where w.organization_id = o.id and w.archived_at is null and w.deleted_at is null) as "workspaceCount",
        (select count(*)::int from invitations i where i.organization_id = o.id and i.deleted_at is null and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) as "pendingInvitations",
        (select count(*)::int from invitations i where i.organization_id = o.id and i.deleted_at is null and i.accepted_at is null and i.revoked_at is null and i.expires_at > now() and i.delivery_status = 'failed') as "failedDeliveries"
        from organizations o where o.id = ${id} and o.deleted_at is null and o.archived_at is null`);
        if (!organization)
          throw new SuperadminError(
            "not_found",
            "Organisation not found.",
            404,
          );
        const [stored] = await tx
          .select()
          .from(schema.superadminOrganizationProfiles)
          .where(eq(schema.superadminOrganizationProfiles.organizationId, id));
        const contacts = await tx
          .select()
          .from(schema.superadminOrganizationContacts)
          .where(eq(schema.superadminOrganizationContacts.organizationId, id))
          .orderBy(
            schema.superadminOrganizationContacts.createdAt,
            schema.superadminOrganizationContacts.id,
          )
          .limit(12);
        const {
          organizationId: _organizationId,
          updatedAt,
          ...profile
        } = stored ?? {
          ...defaultProfile,
          organizationId: id,
          updatedAt: null,
        };
        await audit(
          tx,
          scope,
          "organization.viewed",
          "organization",
          id,
          "Viewed masked organisation profile and operational totals.",
        );
        return {
          ...organization,
          profile,
          updatedAt: updatedAt?.toISOString() ?? null,
          contacts: contacts.map((c) => contactProjection(c)),
        };
      }),
    updateOrganization: (id: string, input: ProfileInput) =>
      run("operate", true, async (tx) => {
        await lockOrganization(tx, id);
        await tx
          .insert(schema.superadminOrganizationProfiles)
          .values({ organizationId: id })
          .onConflictDoNothing();
        const { reason, version, ...fields } = input;
        const rows = await tx
          .update(schema.superadminOrganizationProfiles)
          .set({ ...fields, version: version + 1, updatedAt: new Date() })
          .where(
            and(
              eq(schema.superadminOrganizationProfiles.organizationId, id),
              eq(schema.superadminOrganizationProfiles.version, version),
            ),
          )
          .returning({
            version: schema.superadminOrganizationProfiles.version,
          });
        if (!rows.length)
          throw new SuperadminError(
            "version_conflict",
            "This profile changed. Refresh before saving again.",
            409,
          );
        await audit(
          tx,
          scope,
          "organization.profile_updated",
          "organization",
          id,
          reason,
        );
        return rows[0]!;
      }),
    saveOrganizationContact: (
      id: string,
      contactId: string | null,
      input: ContactInput & { version: number; reason: string },
    ) =>
      run("operate", true, async (tx) => {
        await lockOrganization(tx, id);
        const { reason, version, ...fields } = input;
        const contacts = schema.superadminOrganizationContacts;
        const contact = {
          ...fields,
          email: fields.email.toLowerCase(),
          updatedAt: new Date(),
        };
        let saved;
        if (contactId) {
          [saved] = await tx
            .update(contacts)
            .set({ ...contact, version: version + 1 })
            .where(
              and(
                eq(contacts.organizationId, id),
                eq(contacts.id, contactId),
                eq(contacts.version, version),
              ),
            )
            .returning({ id: contacts.id, version: contacts.version });
          if (!saved)
            throw new SuperadminError(
              "version_conflict",
              "This contact changed or is unavailable. Refresh before saving again.",
              409,
            );
        } else {
          if (version !== 0)
            throw new SuperadminError(
              "version_conflict",
              "New contacts must start at version zero.",
              409,
            );
          const [count] = await tx.execute<{ total: number }>(
            sql`select count(*)::int as total from superadmin_organization_contacts where organization_id = ${id}`,
          );
          if (count!.total >= 12)
            throw new SuperadminError(
              "contact_limit",
              "Keep up to 12 current business contacts. Remove an outdated contact first.",
              409,
            );
          [saved] = await tx
            .insert(contacts)
            .values({ ...contact, id: randomUUID(), organizationId: id })
            .returning({ id: contacts.id, version: contacts.version });
        }
        await audit(
          tx,
          scope,
          contactId
            ? "organization.contact_updated"
            : "organization.contact_added",
          "organization",
          id,
          reason,
        );
        return saved!;
      }),
    revealOrganizationContact: (
      id: string,
      contactId: string,
      reason: string,
    ) =>
      run("operate", true, async (tx) => {
        await lockOrganization(tx, id);
        const [contact] = await tx
          .select()
          .from(schema.superadminOrganizationContacts)
          .where(
            and(
              eq(schema.superadminOrganizationContacts.organizationId, id),
              eq(schema.superadminOrganizationContacts.id, contactId),
            ),
          );
        if (!contact)
          throw new SuperadminError("not_found", "Contact not found.", 404);
        await audit(
          tx,
          scope,
          "organization.contact_revealed",
          "organization",
          id,
          reason,
        );
        return contactProjection(contact, true);
      }),
    deleteOrganizationContact: (
      id: string,
      contactId: string,
      version: number,
      reason: string,
    ) =>
      run("operate", true, async (tx) => {
        await lockOrganization(tx, id);
        const contacts = schema.superadminOrganizationContacts;
        const rows = await tx
          .delete(contacts)
          .where(
            and(
              eq(contacts.organizationId, id),
              eq(contacts.id, contactId),
              eq(contacts.version, version),
            ),
          )
          .returning({ id: contacts.id });
        if (!rows.length)
          throw new SuperadminError(
            "version_conflict",
            "This contact changed or was removed. Refresh first.",
            409,
          );
        await audit(
          tx,
          scope,
          "organization.contact_removed",
          "organization",
          id,
          reason,
        );
        return { removed: true };
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
    revealInvitation: (id: string, reason: string) =>
      run("operate", true, async (tx) => {
        const [invitation] = await tx.execute<{
          id: string;
          name: string;
          email: string;
        }>(sql`
          select i.id, o.name, i.email from invitations i join organizations o on o.id = i.organization_id
          where i.id = ${id} and i.deleted_at is null and o.deleted_at is null`);
        if (!invitation)
          throw new SuperadminError("not_found", "Invitation not found.", 404);
        await audit(
          tx,
          scope,
          "invitation.contact_revealed",
          "organization_invitation",
          id,
          reason,
        );
        return invitation;
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
      contact?: ContactInput | undefined;
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
        if (input.contact)
          await tx.insert(schema.superadminOrganizationContacts).values({
            ...input.contact,
            email: input.contact.email.toLowerCase(),
            id: randomUUID(),
            organizationId: id,
          });
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
