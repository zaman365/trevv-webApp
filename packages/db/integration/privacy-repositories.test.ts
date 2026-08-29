import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  createOrganizationScope,
  createPostgresRepositories,
  RepositoryError,
} from "../src/index.js";
import {
  auditLogs,
  dataLifecycleRequests,
  dataRetentionPolicies,
  memberships,
  organizations,
  outboxEvents,
  users,
} from "../src/schema.js";
import {
  applyMigrationFiles,
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "./database-test-helper.js";

const previousReleaseMigrations = [
  "0000_cool_loa.sql",
  "0001_adorable_sue_storm.sql",
  "0002_trevv_commercial_delta.sql",
  "0003_wandering_prowler.sql",
  "0004_workspace_domain_rename.sql",
  "0005_persistent_data_plane.sql",
  "0006_wet_spirit.sql",
  "0007_normalized_app_user_email.sql",
  "0008_lumpy_sasquatch.sql",
  "0009_cooing_lady_deathstrike.sql",
  "0010_wandering_cargill.sql",
  "0011_natural_marrow.sql",
  "0012_white_skrulls.sql",
  "0013_private_workspace_rooms.sql",
  "0014_legacy_collaboration_upgrade_safety.sql",
];

let temporary: TemporaryDatabase;
let connection: ReturnType<typeof createDatabase>;

beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await migrateCurrent(temporary.url);
  connection = createDatabase(temporary.url);
  await connection.db.insert(organizations).values([
    { id: "org-privacy-a", name: "Privacy A", slug: "privacy-a" },
    { id: "org-privacy-b", name: "Privacy B", slug: "privacy-b" },
  ]);
  await connection.db.insert(users).values([
    {
      id: "user-privacy-owner",
      email: "privacy-owner@example.test",
      name: "Owner",
    },
    {
      id: "user-privacy-member",
      email: "privacy-member@example.test",
      name: "Member",
    },
    {
      id: "user-privacy-other",
      email: "privacy-other@example.test",
      name: "Other",
    },
  ]);
  await connection.db.insert(memberships).values([
    {
      organizationId: "org-privacy-a",
      userId: "user-privacy-owner",
      role: "owner",
    },
    {
      organizationId: "org-privacy-a",
      userId: "user-privacy-member",
      role: "member",
    },
    {
      organizationId: "org-privacy-b",
      userId: "user-privacy-other",
      role: "owner",
    },
  ]);
}, 120_000);

afterAll(async () => {
  await connection?.close();
  await temporary?.drop();
}, 120_000);

function repositories(
  organizationId: string,
  userId: string,
  requestId: string,
) {
  return createPostgresRepositories(connection.db).forOrganization(
    createOrganizationScope({ organizationId, userId, requestId }),
  ).privacy;
}

function mutation(
  idempotencyKey: string,
  route: string,
  method = "POST",
  now = new Date("2026-08-29T12:00:00.000Z"),
) {
  return {
    method,
    route,
    idempotencyKey,
    now,
    responseStatus: 202,
  };
}

describe("privacy data-lifecycle repositories", () => {
  it("submits exactly one tenant-safe request under concurrent exact replay", async () => {
    const key = "81111111-1111-4111-8111-111111111111";
    const input = { kind: "portability" as const, scope: "user" as const };
    const first = repositories(
      "org-privacy-a",
      "user-privacy-member",
      "request-concurrent-a",
    );
    const secondConnection = createDatabase(temporary.url);
    try {
      const second = createPostgresRepositories(
        secondConnection.db,
      ).forOrganization(
        createOrganizationScope({
          organizationId: "org-privacy-a",
          userId: "user-privacy-member",
          requestId: "request-concurrent-b",
        }),
      ).privacy;
      const context = mutation(key, "/api/v1/privacy/requests");
      const [left, right] = await Promise.all([
        first.createRequest(input, context),
        second.createRequest(input, context),
      ]);
      expect(left.value.id).toBe(right.value.id);
      expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
      expect(left.value).toMatchObject({
        requestedBy: "user-privacy-member",
        subjectUserId: "user-privacy-member",
        status: "submitted",
        completedAt: null,
      });
      const persisted = await connection.db
        .select()
        .from(dataLifecycleRequests)
        .where(
          and(
            eq(dataLifecycleRequests.organizationId, "org-privacy-a"),
            eq(dataLifecycleRequests.requestedBy, "user-privacy-member"),
            eq(dataLifecycleRequests.idempotencyKey, key),
          ),
        );
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.resultManifest).toMatchObject({
        externalProviders: [],
        providerRevocation: "not_applicable_no_provider_enabled",
        effectsApplied: false,
        submission: {
          inventoryVersion: "2026-08-29.1",
          policyVersion: "2026-08-29.1",
          deadlineBasis: "engineering_30_day_review_target",
          retention: expect.arrayContaining([
            expect.objectContaining({
              category: "identity",
              enforcementStatus: "not_implemented",
            }),
          ]),
        },
      });
    } finally {
      await secondConnection.close();
    }
  });

  it("rejects same-key/different-request reuse without creating an effect", async () => {
    const privacy = repositories(
      "org-privacy-a",
      "user-privacy-member",
      "request-fingerprint",
    );
    const key = "82222222-2222-4222-8222-222222222222";
    const context = mutation(key, "/api/v1/privacy/requests");
    await privacy.createRequest({ kind: "access", scope: "user" }, context);
    await expect(
      privacy.createRequest({ kind: "erasure", scope: "user" }, context),
    ).rejects.toMatchObject<Partial<RepositoryError>>({
      code: "idempotency_key_reused",
    });
  });

  it("allows a key to be reused only after its persisted idempotency window expires", async () => {
    const privacy = repositories(
      "org-privacy-a",
      "user-privacy-member",
      "request-expired-key",
    );
    const key = "82333333-3333-4333-8333-333333333333";
    const route = "/api/v1/privacy/requests";
    const input = { kind: "rectification" as const, scope: "user" as const };
    const first = await privacy.createRequest(input, mutation(key, route));
    const afterExpiry = new Date("2026-08-30T13:00:00.000Z");
    const second = await privacy.createRequest(
      input,
      mutation(key, route, "POST", afterExpiry),
    );

    expect(second.replayed).toBe(false);
    expect(second.value.id).not.toBe(first.value.id);
    const persisted = await connection.db
      .select({ id: dataLifecycleRequests.id })
      .from(dataLifecycleRequests)
      .where(
        and(
          eq(dataLifecycleRequests.organizationId, "org-privacy-a"),
          eq(dataLifecycleRequests.requestedBy, "user-privacy-member"),
          eq(dataLifecycleRequests.idempotencyKey, key),
        ),
      );
    expect(persisted).toHaveLength(2);
  });

  it("rejects invalid organization request kinds at the database boundary", async () => {
    const insertion = connection.db.insert(dataLifecycleRequests).values({
      id: "privacy-invalid-scope-kind",
      organizationId: "org-privacy-a",
      requestedBy: "user-privacy-owner",
      subjectUserId: null,
      kind: "rectification",
      requestScope: "organization",
      status: "submitted",
      idempotencyKey: "invalid-scope-kind",
      requestFingerprint: "invalid-scope-kind",
      dueAt: new Date("2026-09-28T12:00:00.000Z"),
      retentionUntil: new Date("2028-08-28T12:00:00.000Z"),
    });
    await expect(insertion).rejects.toMatchObject({
      cause: {
        constraint_name: "data_lifecycle_requests_kind_scope_check",
      },
    });
  });

  it("reports the current version after stale cancellation and retention writes", async () => {
    const privacy = repositories(
      "org-privacy-a",
      "user-privacy-owner",
      "request-current-version",
    );
    const created = await privacy.createRequest(
      { kind: "access", scope: "user" },
      mutation(
        "82444444-4444-4444-8444-444444444444",
        "/api/v1/privacy/requests",
      ),
    );
    await privacy.cancelRequest(
      created.value.id,
      created.value.version,
      mutation(
        "82555555-5555-4555-8555-555555555555",
        "/api/v1/privacy/requests/:id",
        "DELETE",
      ),
    );
    await expect(
      privacy.cancelRequest(
        created.value.id,
        created.value.version,
        mutation(
          "82666666-6666-4666-8666-666666666666",
          "/api/v1/privacy/requests/:id",
          "DELETE",
        ),
      ),
    ).rejects.toMatchObject({
      code: "version_conflict",
      details: { expectedVersion: 1, currentVersion: 2 },
    });

    const firstPolicy = await privacy.updateRetentionPolicy(
      1,
      {
        category: "operations",
        retentionDays: 45,
        disposition: "delete",
        legalHold: false,
      },
      mutation(
        "82777777-7777-4777-8777-777777777777",
        "/api/v1/privacy/retention",
        "PUT",
      ),
    );
    expect(firstPolicy.value.policyVersion).toBe(2);
    await expect(
      privacy.updateRetentionPolicy(
        1,
        {
          category: "operations",
          retentionDays: 60,
          disposition: "delete",
          legalHold: false,
        },
        mutation(
          "82888888-8888-4888-8888-888888888888",
          "/api/v1/privacy/retention",
          "PUT",
        ),
      ),
    ).rejects.toMatchObject({
      code: "version_conflict",
      details: { expectedVersion: 1, currentVersion: 2 },
    });
  });

  it("does not leak guessed request IDs across users or organizations", async () => {
    const owner = repositories(
      "org-privacy-a",
      "user-privacy-owner",
      "request-owner",
    );
    const otherTenant = repositories(
      "org-privacy-b",
      "user-privacy-other",
      "request-other",
    );
    const created = await owner.createRequest(
      { kind: "access", scope: "organization" },
      mutation(
        "83333333-3333-4333-8333-333333333333",
        "/api/v1/privacy/requests",
      ),
    );
    await expect(
      otherTenant.getRequest(created.value.id),
    ).rejects.toMatchObject({
      code: "resource_not_found",
    });
    const member = repositories(
      "org-privacy-a",
      "user-privacy-member",
      "request-member-cancel",
    );
    await expect(
      member.cancelRequest(
        created.value.id,
        created.value.version,
        mutation(
          "84444444-4444-4444-8444-444444444444",
          "/api/v1/privacy/requests/:id",
          "DELETE",
        ),
      ),
    ).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(
      member.listRequests({ requestedBy: "user-privacy-member" }),
    ).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.value.id }),
      ]),
    );
  });

  it("journals cancellation and retention overrides atomically and idempotently", async () => {
    const privacy = repositories(
      "org-privacy-a",
      "user-privacy-owner",
      "request-lifecycle",
    );
    const created = await privacy.createRequest(
      { kind: "restriction", scope: "organization" },
      mutation(
        "85555555-5555-4555-8555-555555555555",
        "/api/v1/privacy/requests",
      ),
    );
    const cancelContext = mutation(
      "86666666-6666-4666-8666-666666666666",
      "/api/v1/privacy/requests/:id",
      "DELETE",
    );
    const cancelled = await privacy.cancelRequest(
      created.value.id,
      created.value.version,
      cancelContext,
    );
    const cancelReplay = await privacy.cancelRequest(
      created.value.id,
      created.value.version,
      cancelContext,
    );
    expect(cancelled.value.status).toBe("cancelled");
    expect(cancelReplay).toMatchObject({
      replayed: true,
      value: { status: "cancelled" },
    });

    const policyContext = mutation(
      "87777777-7777-4777-8777-777777777777",
      "/api/v1/privacy/retention",
      "PUT",
    );
    const policy = await privacy.updateRetentionPolicy(
      1,
      {
        category: "audit",
        retentionDays: 900,
        disposition: "manual_review",
        legalHold: true,
      },
      policyContext,
    );
    const policyReplay = await privacy.updateRetentionPolicy(
      1,
      {
        category: "audit",
        retentionDays: 900,
        disposition: "manual_review",
        legalHold: true,
      },
      policyContext,
    );
    expect(policy.value).toMatchObject({
      legalHold: true,
      policyVersion: 2,
      source: "organization_override",
    });
    expect(policyReplay.replayed).toBe(true);

    const [storedPolicy] = await connection.db
      .select()
      .from(dataRetentionPolicies)
      .where(
        and(
          eq(dataRetentionPolicies.organizationId, "org-privacy-a"),
          eq(dataRetentionPolicies.category, "audit"),
        ),
      );
    expect(storedPolicy).toMatchObject({ legalHold: true, policyVersion: 2 });
    const lifecycleAudit = await connection.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, "org-privacy-a"),
          eq(auditLogs.targetId, created.value.id),
        ),
      );
    const lifecycleOutbox = await connection.db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, "org-privacy-a"),
          eq(outboxEvents.aggregateId, created.value.id),
        ),
      );
    expect(lifecycleAudit.map(({ action }) => action).sort()).toEqual([
      "privacy.request.cancelled",
      "privacy.request.submitted",
    ]);
    expect(lifecycleOutbox.map(({ eventType }) => eventType).sort()).toEqual([
      "privacy.request.cancelled",
      "privacy.request.submitted",
    ]);
  });
});

describe("Phase 5 previous-release migration upgrade", () => {
  it("preserves a populated 0014 tenant while adding privacy and shared rate-limit boundaries", async () => {
    const upgrade = await createTemporaryDatabase();
    try {
      await applyMigrationFiles(upgrade.url, previousReleaseMigrations);
      const client = postgres(upgrade.url, { max: 1, prepare: false });
      try {
        await client.unsafe(`
          insert into organizations (id, name, slug)
          values ('org-phase5-upgrade', 'Phase 5 Upgrade', 'phase5-upgrade');
          insert into app_users (id, email, name)
          values ('user-phase5-upgrade', 'phase5-upgrade@example.test', 'Upgrade Owner');
          insert into memberships (organization_id, user_id, role)
          values ('org-phase5-upgrade', 'user-phase5-upgrade', 'owner');
        `);
        await applyMigrationFiles(upgrade.url, [
          "0015_silky_sharon_ventura.sql",
          "0016_shared_api_rate_limits.sql",
        ]);

        const [state] = await client<
          Array<{
            organization_name: string;
            privacy_table: string;
            rate_limit_table: string;
          }>
        >`
          select organization.name as organization_name,
            to_regclass('public.data_lifecycle_requests')::text as privacy_table,
            to_regclass('public.api_rate_limit_windows')::text as rate_limit_table
          from organizations organization
          where organization.id = 'org-phase5-upgrade'
        `;
        expect(state).toEqual({
          organization_name: "Phase 5 Upgrade",
          privacy_table: "data_lifecycle_requests",
          rate_limit_table: "api_rate_limit_windows",
        });
      } finally {
        await client.end();
      }
    } finally {
      await upgrade.drop();
    }
  }, 120_000);
});
