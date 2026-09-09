import { createHmac, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createMemoryMailSink,
  createSuperadminAuthRuntime,
  createTrevvAuthRuntime,
} from "@founderhq/auth-server";
import {
  authUsers,
  bootstrapSuperadminOwner,
  createDatabase,
  createIdentityRepositories,
  createIdentityScope,
  createSuperadminRepositories,
  hashInvitationToken,
  initialSuperadminEmail,
  recordSuperadminInvitationDelivery,
  superadminInvitations,
  superadminTokenHash,
  type SuperadminScope,
} from "@founderhq/db";
import {
  createTemporaryDatabase,
  migrateCurrent,
  sql,
  type TemporaryDatabase,
} from "../../../packages/db/integration/database-test-helper.js";
import { createSuperadminApi } from "../src/superadmin.js";

const origin = "https://control.trevv.test";
const password = "test-only-strong-administrator-password";
let temporary: TemporaryDatabase;
let database: ReturnType<typeof createDatabase>;
let auth: ReturnType<typeof createSuperadminAuthRuntime>;
let app: Hono;
const mail = createMemoryMailSink();
const ownerCookies = new Map<string, string>();
let ownerScope: SuperadminScope;
let ownerSetup: { totpURI: string; backupCodes: string[] };

async function request(
  path: string,
  body?: unknown,
  jar = ownerCookies,
  extra: Record<string, string> = {},
) {
  const headers = new Headers({
    origin,
    "content-type": "application/json",
    cookie: Array.from(jar, ([key, value]) => `${key}=${value}`).join("; "),
    ...extra,
  });
  const response = await app.request(`${origin}/api/superadmin${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0]!;
    const split = pair.indexOf("=");
    if (split !== -1) jar.set(pair.slice(0, split), pair.slice(split + 1));
  }
  return response;
}
async function activate(
  email: string,
  token: string,
  jar: Map<string, string>,
  injectedRole = "owner",
) {
  const response = await request(
    "/auth/sign-up/email",
    {
      email,
      password,
      name: "Test Administrator",
      role: injectedRole,
      twoFactorEnabled: true,
    },
    jar,
    { "x-superadmin-invitation": token },
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const login = await request("/auth/sign-in/email", { email, password }, jar);
  expect(login.status, await login.clone().text()).toBe(200);
  expect(await login.json()).not.toHaveProperty("token");
}
async function enroll(jar: Map<string, string>) {
  const before = await request("/overview", undefined, jar);
  expect(before.status).toBe(403);
  const enabled = await request(
    "/auth/two-factor/enable",
    { password, method: "totp" },
    jar,
  );
  expect(enabled.status, await enabled.clone().text()).toBe(200);
  const setup = (await enabled.json()) as {
    totpURI: string;
    backupCodes: string[];
  };
  expect(setup.backupCodes).toHaveLength(10);
  const invalid = await request(
    "/auth/two-factor/verify-totp",
    { code: "bad" },
    jar,
  );
  expect(invalid.status).toBeGreaterThanOrEqual(400);
  expect((await request("/overview", undefined, jar)).status).toBe(403);
  const verified = await request(
    "/auth/two-factor/verify-totp",
    { code: totp(setup.totpURI) },
    jar,
  );
  expect(verified.status, await verified.clone().text()).toBe(200);
  return setup;
}
async function scope(jar: Map<string, string>) {
  const identity = await auth.resolve(
    new Request(`${origin}/api/superadmin/session`, {
      headers: {
        cookie: Array.from(jar, ([key, value]) => `${key}=${value}`).join("; "),
      },
    }),
  );
  expect(identity?.assuranceAt).toBeTruthy();
  return {
    administratorId: identity!.id,
    sessionId: identity!.sessionId,
    requestId: randomUUID(),
  };
}

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error(
      "Superadmin tests require an explicit isolated TEST_DATABASE_URL.",
    );
  temporary = await createTemporaryDatabase(process.env.TEST_DATABASE_URL, {
    namePrefix: "trevv_superadmin_it",
  });
  await migrateCurrent(temporary.url);
  database = createDatabase(temporary.url);
  auth = createSuperadminAuthRuntime({
    databaseUrl: temporary.url,
    baseUrl: origin,
    webOrigin: origin,
    secret: "test-only-isolated-administrator-secret-at-least-32-characters",
    mailDelivery: mail,
    mailFrom: "control@trevv.test",
  });
  app = new Hono().route(
    "/api/superadmin",
    createSuperadminApi({
      auth,
      repositories: (value) => createSuperadminRepositories(database.db, value),
      webOrigin: origin,
      mailDelivery: mail,
      mailFrom: "control@trevv.test",
      recordDelivery: (kind, id, token, sent) =>
        recordSuperadminInvitationDelivery(database.db, kind, id, token, sent),
      onError: (error) => console.error(error),
    }),
  );
  const invitation = await bootstrapSuperadminOwner(database.db);
  expect(invitation.email).toBe(initialSuperadminEmail);
  await activate(invitation.email, invitation.token, ownerCookies);
  ownerSetup = await enroll(ownerCookies);
  ownerScope = await scope(ownerCookies);
}, 120_000);
afterAll(async () => {
  await auth?.close();
  await database?.close();
  await temporary?.drop();
}, 120_000);

describe.sequential("isolated Superadmin control plane", () => {
  it("requires a factor on each password sign-in and consumes recovery codes once", async () => {
    await request("/auth/sign-out", {});
    const login = await request("/auth/sign-in/email", {
      email: initialSuperadminEmail,
      password,
    });
    expect(await login.json()).toMatchObject({ twoFactorRedirect: true });
    expect((await request("/overview")).status).toBe(401);
    const verified = await request("/auth/two-factor/verify-totp", {
      code: totp(ownerSetup.totpURI),
    });
    expect(verified.status, await verified.clone().text()).toBe(200);
    expect(await verified.json()).not.toHaveProperty("token");
    expect((await request("/overview")).status).toBe(200);
    await request("/auth/sign-out", {});
    await request("/auth/sign-in/email", {
      email: initialSuperadminEmail,
      password,
    });
    const recovered = await request("/auth/two-factor/verify-backup-code", {
      code: ownerSetup.backupCodes[0],
    });
    expect(recovered.status, await recovered.clone().text()).toBe(200);
    await request("/auth/sign-out", {});
    await request("/auth/sign-in/email", {
      email: initialSuperadminEmail,
      password,
    });
    const replay = await request("/auth/two-factor/verify-backup-code", {
      code: ownerSetup.backupCodes[0],
    });
    expect(replay.status).toBeGreaterThanOrEqual(400);
    expect((await request("/overview")).status).toBe(401);
    expect(
      (
        await request("/auth/two-factor/verify-totp", {
          code: totp(ownerSetup.totpURI),
        })
      ).status,
    ).toBe(200);
    ownerScope = await scope(ownerCookies);
  });
  it("requires an emailed single-use invitation and rejects public signup or forged roles", async () => {
    const result = await request(
      "/auth/sign-up/email",
      {
        email: "intruder@example.test",
        password,
        name: "Uninvited",
        role: "owner",
      },
      new Map(),
    );
    expect(result.status).toBe(403);
    const [count] = await database.db.execute<{ count: number }>(
      sql`select count(*)::int as count from superadmin_user`,
    );
    expect(count?.count).toBe(1);
    await expect(bootstrapSuperadminOwner(database.db)).rejects.toMatchObject({
      code: "already_bootstrapped",
    });
    const [admission] = await database.db.execute<{
      admissionTokenHash: string | null;
      twoFactorEnabled: boolean;
    }>(
      sql`select "admissionTokenHash", "twoFactorEnabled" from superadmin_user`,
    );
    expect(admission).toEqual({
      admissionTokenHash: null,
      twoFactorEnabled: true,
    });
  });
  it("isolates administrator cookies, exposes no bearer token and blocks auth bypass endpoints", async () => {
    expect((await request("/overview", undefined, new Map())).status).toBe(401);
    expect(
      (
        await request(
          "/overview",
          undefined,
          new Map([["trevv.session_token", "customer-session"]]),
        )
      ).status,
    ).toBe(401);
    for (const path of [
      "/auth/update-user",
      "/auth/two-factor/disable",
      "/auth/change-email",
      "/auth/delete-user",
    ])
      expect((await request(path, {})).status).toBe(404);
    expect((await request("/auth/get-session")).status).toBe(404);
    const session = await request("/session");
    expect(session.headers.get("cache-control")).toContain("no-store");
    expect(await session.json()).not.toHaveProperty("sessionId");
    const tenant = createTrevvAuthRuntime({
      databaseUrl: temporary.url,
      baseUrl: origin,
      secret: "test-only-different-customer-authentication-secret",
      trustedOrigins: [origin],
      registrationMode: "invite_only",
      mailDelivery: createMemoryMailSink(),
      mailFrom: "test@trevv.test",
    });
    try {
      const result = await tenant.identityResolver.resolve(
        new Request(`${origin}/api/auth/get-session`, {
          headers: {
            cookie: Array.from(
              ownerCookies,
              ([key, value]) => `${key}=${value}`,
            ).join("; "),
          },
        }),
      );
      expect(result).toBeNull();
    } finally {
      await tenant.close();
    }
    expect(
      Array.from(ownerCookies.keys()).some((key) =>
        key.startsWith("__Secure-trevv_superadmin."),
      ),
    ).toBe(true);
  });
  it("rejects cross-origin, unverified-factor and oversized mutations", async () => {
    expect((await request("/auth/sign-in/email", null)).status).toBe(400);
    expect((await request("/auth/sign-in/email", [])).status).toBe(400);
    expect(
      (
        await request("/organizations", { name: "Forbidden" }, ownerCookies, {
          origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (await request("/organizations", { value: "x".repeat(34_000) })).status,
    ).toBe(413);
    const response = await request("/auth/passkey/generate-register-options");
    expect(response.status, await response.clone().text()).toBe(200);
    const options = (await response.json()) as {
      authenticatorSelection: { userVerification: string };
      rp: { id: string };
    };
    expect(options.authenticatorSelection.userVerification).toBe("required");
    expect(options.rp.id).toBe("control.trevv.test");
  });
  it("creates an organisation and lets only the invited verified owner accept it", async () => {
    const result = await request("/organizations", {
      name: "New Organisation",
      slug: "new-organisation",
      ownerEmail: "customer-owner@example.test",
      reason: "Onboard the requested evaluation organisation.",
    });
    expect(result.status, await result.clone().text()).toBe(201);
    const body = (await result.json()) as {
      id: string;
      invitationId: string;
      deliveryStatus: string;
    };
    expect(body.deliveryStatus).toBe("sent");
    expect(body).not.toHaveProperty("token");
    const delivery = mail.messages().at(-1)!;
    const link = delivery.text.match(/https:\/\/[^\s]+/u)![0];
    const token = new URL(link).searchParams.get("token")!;
    const customerId = randomUUID();
    await database.db.insert(authUsers).values({
      id: customerId,
      email: "customer-owner@example.test",
      name: "Customer Owner",
      emailVerified: true,
    });
    const identity = createIdentityRepositories(
      database.db,
      createIdentityScope({ authUserId: customerId, requestId: randomUUID() }),
    );
    const accepted = await identity.invitations.accept(
      hashInvitationToken(token),
    );
    expect(accepted.membership.role).toBe("owner");
    expect(accepted.organizationId).toBe(body.id);
    const [members] = await database.db.execute<{ count: number }>(
      sql`select count(*)::int as count from memberships where organization_id = ${body.id}`,
    );
    expect(members?.count).toBe(1);
    const projection = (await (await request("/directory/people")).json()) as {
      items: { email: string; name: string }[];
    };
    expect(JSON.stringify(projection)).not.toContain(
      "customer-owner@example.test",
    );
    expect(JSON.stringify(projection)).not.toContain("Customer Owner");
    const revealed = await request(`/people/${customerId}/reveal`, {
      reason: "Contact the account owner about onboarding.",
    });
    expect(await revealed.json()).toMatchObject({
      email: "customer-owner@example.test",
    });
    const [audit] = await database.db.execute<{ count: number }>(
      sql`select count(*)::int as count from superadmin_audit where action = 'person.contact_revealed' and target_id = ${customerId}`,
    );
    expect(audit?.count).toBe(1);
  });
  it("assigns invited roles server-side and immediately revokes delegated administrator sessions", async () => {
    const owner = createSuperadminRepositories(database.db, ownerScope);
    const invitation = await owner.inviteAdministrator(
      "auditor@example.test",
      "auditor",
      "Assign an auditor for the operational review.",
    );
    const jar = new Map<string, string>();
    await activate(invitation.email, invitation.token, jar, "owner");
    await enroll(jar);
    const auditor = await scope(jar);
    const session = (await (
      await request("/session", undefined, jar)
    ).json()) as { role: string };
    expect(session.role).toBe("auditor");
    expect((await request("/overview", undefined, jar)).status).toBe(200);
    expect(
      (await request("/directory/administrators", undefined, jar)).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/organizations",
          {
            name: "Denied Org",
            slug: "denied-org",
            ownerEmail: "any@example.test",
            reason: "An auditor must not create organisations.",
          },
          jar,
        )
      ).status,
    ).toBe(403);
    const replay = await request(
      "/auth/sign-up/email",
      { email: invitation.email, password, name: "Replay" },
      new Map(),
      { "x-superadmin-invitation": invitation.token },
    );
    expect(replay.status).toBeGreaterThanOrEqual(400);
    await owner.updateAdministrator(
      auditor.administratorId,
      "auditor",
      true,
      "Revoke the temporary audit assignment.",
    );
    expect((await request("/overview", undefined, jar)).status).toBe(401);
    await expect(
      createSuperadminRepositories(database.db, auditor).overview(),
    ).rejects.toMatchObject({ code: "superadmin_access_denied" });
  });
  it("protects the final owner and makes stale sensitive sessions reauthenticate", async () => {
    const owner = createSuperadminRepositories(database.db, ownerScope);
    await expect(
      owner.updateAdministrator(
        ownerScope.administratorId,
        "auditor",
        true,
        "An owner must not revoke themselves.",
      ),
    ).rejects.toMatchObject({ code: "self_revocation" });
    await expect(
      database.db.execute(
        sql`update superadmin_user set disabled = true where id = ${ownerScope.administratorId}`,
      ),
    ).rejects.toThrow();
    await database.db.execute(
      sql`update superadmin_session set "assuranceAt" = now() - interval '11 minutes' where id = ${ownerScope.sessionId}`,
    );
    expect((await request("/overview")).status).toBe(200);
    await expect(owner.updatePhone("+491234567890")).rejects.toMatchObject({
      code: "superadmin_access_denied",
    });
    await database.db.execute(
      sql`update superadmin_session set "assuranceAt" = now() where id = ${ownerScope.sessionId}`,
    );
    expect(await owner.updatePhone("+491234567890")).toEqual({
      phoneNumber: "+491234567890",
      phoneVerified: false,
    });
    await expect(owner.updatePhone("not-a-phone")).rejects.toThrow();
  });
  it("does not activate expired or revoked administrator invitations, even at the database boundary", async () => {
    const token = "s".repeat(43),
      id = randomUUID();
    await database.db.insert(superadminInvitations).values({
      id,
      email: "expired@example.test",
      role: "owner",
      tokenHash: superadminTokenHash(token),
      invitedBy: ownerScope.administratorId,
      expiresAt: new Date(Date.now() - 1000),
    });
    const response = await request(
      "/auth/sign-up/email",
      { email: "expired@example.test", password, name: "Expired" },
      new Map(),
      { "x-superadmin-invitation": token },
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    await expect(
      database.db.execute(
        sql`insert into superadmin_user (id, name, email, "admissionTokenHash") values (${randomUUID()}, 'Forged', 'forged@example.test', ${superadminTokenHash(token)})`,
      ),
    ).rejects.toThrow();
  });
});

function totp(uri: string) {
  const secret = new URL(uri).searchParams.get("secret")!;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase().replace(/=+$/u, "")]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    bits.match(/.{8}/gu)!.map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest.at(-1)! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}
