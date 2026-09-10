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
import {
  superadminOrganizationDetailSchema,
  superadminOverviewSchema,
} from "@founderhq/api-contract";
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
let profileOrganizationId: string;
let ownerSetup: { totpURI: string; backupCodes: string[] };

async function request(
  path: string,
  body?: unknown,
  jar = ownerCookies,
  extra: Record<string, string> = {},
  method = body === undefined ? "GET" : "POST",
) {
  const headers = new Headers({
    origin,
    "content-type": "application/json",
    cookie: Array.from(jar, ([key, value]) => `${key}=${value}`).join("; "),
    ...extra,
  });
  const response = await app.request(`${origin}/api/superadmin${path}`, {
    method,
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
  it("manages versioned organisation profiles and masked business contacts without changing tenant access", async () => {
    const owner = createSuperadminRepositories(database.db, ownerScope);
    const contact = {
      kind: "primary" as const,
      name: "Confidential Contact Person",
      jobTitle: "Operations lead",
      email: "contact-private@example.test",
      phone: "+491234567891",
    };
    const created = await request("/organizations", {
      name: "Profile Company",
      slug: "profile-company",
      ownerEmail: "profile-owner@example.test",
      contact,
      reason: "Set up the requested business relationship.",
    });
    expect(created.status, await created.clone().text()).toBe(201);
    profileOrganizationId = ((await created.json()) as { id: string }).id;
    const path = `/organizations/${profileOrganizationId}`;
    const read = await request(path);
    expect(read.headers.get("cache-control")).toContain("no-store");
    const detail = superadminOrganizationDetailSchema.parse(await read.json());
    expect(detail.profile.version).toBe(0);
    expect(detail.contacts).toHaveLength(1);
    expect(detail.ownerCount).toBe(0);
    for (const value of [
      contact.name,
      contact.email,
      contact.phone,
      contact.jobTitle,
    ])
      expect(JSON.stringify(detail)).not.toContain(value);
    const input = {
      ...detail.profile,
      legalName: "Profile Company GmbH",
      website: "https://example.test",
      country: "Germany",
      city: "Berlin",
      industry: "Software",
      stage: "needs_review" as const,
      priority: "priority" as const,
      nextReviewAt: "2020-01-01",
      reason: "Record business details and schedule the review.",
    };
    const writes = await Promise.all([
      request(path, input, ownerCookies, {}, "PATCH"),
      request(path, input, ownerCookies, {}, "PATCH"),
    ]);
    expect(writes.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await request(
          path,
          { ...input, version: 1, website: "javascript:alert(1)" },
          ownerCookies,
          {},
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          path,
          { ...input, version: 1, nextReviewAt: "2026-02-30" },
          ownerCookies,
          {},
          "PATCH",
        )
      ).status,
    ).toBe(400);
    const contactId = detail.contacts[0]!.id;
    expect(
      await (
        await request(`${path}/contacts/${contactId}/reveal`, {
          reason: "Contact the organisation about onboarding.",
        })
      ).json(),
    ).toMatchObject(contact);
    const duplicate = await request(`${path}/contacts`, {
      ...contact,
      version: 0,
      reason: "Try adding a second primary business contact.",
    });
    expect(duplicate.status).toBe(409);
    const other = await owner.createOrganization({
      name: "Other Company",
      slug: "other-company",
      ownerEmail: "other@example.test",
      reason: "Set up an independent organisation for comparison.",
    });
    expect(
      (
        await request(
          `/organizations/${other.id}/contacts/${contactId}/reveal`,
          { reason: "This contact must be scoped to its organisation." },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/organizations/${other.id}/contacts/${contactId}`,
          {
            ...contact,
            version: 1,
            reason: "Do not edit a different organisation contact.",
          },
          ownerCookies,
          {},
          "PATCH",
        )
      ).status,
    ).toBe(409);
    const updated = await request(
      `${path}/contacts/${contactId}`,
      {
        ...contact,
        jobTitle: "Operations manager",
        version: 1,
        reason: "Correct the current business contact responsibility.",
      },
      ownerCookies,
      {},
      "PATCH",
    );
    expect(updated.status).toBe(200);
    expect(
      (
        await request(
          `${path}/contacts/${contactId}`,
          {
            version: 1,
            reason: "A stale contact revision must not be removed.",
          },
          ownerCookies,
          {},
          "DELETE",
        )
      ).status,
    ).toBe(409);
    const overview = superadminOverviewSchema.parse(
      await (await request("/overview")).json(),
    );
    expect(overview.reviewsDue).toBeGreaterThanOrEqual(1);
    expect(overview.missingContacts).toBeGreaterThanOrEqual(1);
    for (const filter of ["needs_review", "review_due"]) {
      const result = (await (
        await request(`/directory/organizations?filter=${filter}&q=Profile`)
      ).json()) as { items: { id: string }[] };
      expect(result.items.map((row) => row.id)).toContain(
        profileOrganizationId,
      );
      expect(JSON.stringify(result)).not.toContain(contact.name);
      expect(JSON.stringify(result)).not.toContain(contact.email);
    }
    expect(
      (await request("/directory/people?filter=missing_contact")).status,
    ).toBe(400);
    expect(
      (await request("/directory/audit?organizationId=anything")).status,
    ).toBe(400);
    const inviteList = (await (
      await request(
        `/directory/invitations?organizationId=${profileOrganizationId}&filter=pending`,
      )
    ).json()) as { items: { organizationId: string }[] };
    expect(inviteList.items).toHaveLength(1);
    expect(inviteList.items[0]!.organizationId).toBe(profileOrganizationId);
    const auditRows = await database.db.execute<{
      action: string;
      reason: string;
    }>(
      sql`select action, reason from superadmin_audit where target_id = ${profileOrganizationId}`,
    );
    expect(
      auditRows.some((row) => row.action === "organization.contact_revealed"),
    ).toBe(true);
    expect(JSON.stringify(auditRows)).not.toContain(contact.name);
    expect(JSON.stringify(auditRows)).not.toContain(contact.phone);
    expect(
      (
        await request(
          `${path}/contacts/${contactId}`,
          {
            version: 2,
            reason: "Remove an outdated contact under the retention review.",
          },
          ownerCookies,
          {},
          "DELETE",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`${path}/contacts/${contactId}/reveal`, {
          reason: "Removed contacts must no longer be returned.",
        })
      ).status,
    ).toBe(404);
    const [members] = await database.db.execute<{ count: number }>(
      sql`select count(*)::int as count from memberships where organization_id = ${profileOrganizationId}`,
    );
    expect(members!.count).toBe(0);
    await database.db.execute(
      sql`update superadmin_session set "assuranceAt" = now() - interval '11 minutes' where id = ${ownerScope.sessionId}`,
    );
    expect((await request(path)).status).toBe(200);
    expect(
      (await request(path, { ...input, version: 1 }, ownerCookies, {}, "PATCH"))
        .status,
    ).toBe(403);
    expect(
      (
        await request(`${path}/contacts`, {
          ...contact,
          version: 0,
          reason: "A fresh verification is required to add contacts.",
        })
      ).status,
    ).toBe(403);
    await database.db.execute(
      sql`update superadmin_session set "assuranceAt" = now() where id = ${ownerScope.sessionId}`,
    );
  });
  it("enforces contact capacity atomically and filters administrator, invitation and people states", async () => {
    const owner = createSuperadminRepositories(database.db, ownerScope);
    const contact = {
      kind: "other" as const,
      name: "Business Contact",
      jobTitle: "",
      email: "business@example.test",
      phone: "",
      version: 0,
      reason: "Maintain the organisation business contact directory.",
    };
    for (let index = 0; index < 11; index++)
      await owner.saveOrganizationContact(profileOrganizationId, null, contact);
    const writes = await Promise.allSettled([
      owner.saveOrganizationContact(profileOrganizationId, null, contact),
      owner.saveOrganizationContact(profileOrganizationId, null, contact),
    ]);
    expect(writes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(writes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "contact_limit" },
    });
    for (const [kind, filter] of [
      ["people", "verified"],
      ["people", "unverified"],
      ["people", "no_organization"],
      ["administrators", "setup_pending"],
      ["administrators", "owner"],
      ["invitations", "delivery_failed"],
      ["audit", "contact_access"],
      ["audit", "changes"],
    ]) {
      expect(
        (await request(`/directory/${kind}?filter=${filter}`)).status,
      ).toBe(200);
    }
    const rows = (await (
      await request(`/directory/people?organizationId=${profileOrganizationId}`)
    ).json()) as { total: number };
    expect(rows.total).toBe(0);
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
    expect(
      (await request(`/organizations/${profileOrganizationId}`, undefined, jar))
        .status,
    ).toBe(200);
    expect(
      (
        await request(
          `/organizations/${profileOrganizationId}/contacts`,
          {
            kind: "other",
            name: "Denied Contact",
            jobTitle: "",
            email: "denied@example.test",
            phone: "",
            version: 0,
            reason: "Auditors cannot mutate business contacts.",
          },
          jar,
        )
      ).status,
    ).toBe(403);
    const masked = (await (
      await request(`/organizations/${profileOrganizationId}`, undefined, jar)
    ).json()) as { contacts: { id: string }[] };
    expect(
      (
        await request(
          `/organizations/${profileOrganizationId}/contacts/${masked.contacts[0]!.id}/reveal`,
          { reason: "Auditors cannot access unmasked personal contact data." },
          jar,
        )
      ).status,
    ).toBe(403);
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
