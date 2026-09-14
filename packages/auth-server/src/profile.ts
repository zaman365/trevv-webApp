import { parseProfileUpdate, type AccountProfile } from "@founderhq/core";
import type { Pool, PoolClient } from "pg";

export const pendingEmailIdentifier = (id: string) =>
  `trevv-email-change:${id}`;
export const emailChangeTokenOwner = (id: string) => `email-change:${id}`;

export function trustedProfileOrigin(
  request: Request,
  origins: readonly string[],
) {
  const origin = request.headers.get("origin");
  return Boolean(
    origin && origins.some((allowed) => new URL(allowed).origin === origin),
  );
}

const profileSelect = `select u.id, u.name, u.email, u.profile as details,
  u.updated_at::text as version, a."emailVerified" as "emailVerified"
  from app_users u join auth_user_mappings m on m.app_user_id = u.id
  join "user" a on a.id = m.auth_user_id
  where m.auth_user_id = $1 and u.deleted_at is null and u.archived_at is null`;

export async function readAccountProfile(
  pool: Pool | PoolClient,
  authUserId: string,
) {
  const result = await pool.query<AccountProfile>(profileSelect, [authUserId]);
  const profile = result.rows[0];
  if (!profile) return null;
  const pending = await pool.query<{ value: string; expiresAt: Date }>(
    `select value, "expiresAt" from verification where identifier = $1 and "expiresAt" > now()`,
    [pendingEmailIdentifier(authUserId)],
  );
  if (pending.rows[0]) {
    const value = JSON.parse(pending.rows[0].value);
    profile.pendingEmail = {
      email: value.email,
      stage: value.stage,
      expiresAt: pending.rows[0].expiresAt.toISOString(),
    };
  }
  return profile;
}

export async function saveAccountProfile(
  pool: Pool,
  authUserId: string,
  body: unknown,
) {
  const input = parseProfileUpdate(body);
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Auth identity and product identity are locked in the same order as the
    // identity-sync trigger. A stale editor cannot overwrite another save.
    await client.query(`select id from "user" where id = $1 for update`, [
      authUserId,
    ]);
    const current = await client.query<AccountProfile>(
      `${profileSelect} for update of u`,
      [authUserId],
    );
    const profile = current.rows[0];
    if (!profile)
      throw Object.assign(new Error("Your profile is unavailable."), {
        status: 403,
      });
    if (profile.version !== input.version)
      throw Object.assign(
        new Error(
          "Your profile changed in another window. Reload it before saving again.",
        ),
        { status: 409 },
      );
    await client.query(
      `update "user" set name = $2, "updatedAt" = now() where id = $1`,
      [authUserId, input.name],
    );
    await client.query(
      `update app_users set name = $2, profile = $3::jsonb, updated_at = clock_timestamp() where id = $1`,
      [profile.id, input.name, JSON.stringify(input.details)],
    );
    const saved = await readAccountProfile(client, authUserId);
    await client.query("commit");
    return saved;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelEmailChange(pool: Pool, authUserId: string) {
  await pool.query(
    `delete from verification where identifier = $1 or value = $2`,
    [pendingEmailIdentifier(authUserId), emailChangeTokenOwner(authUserId)],
  );
}
