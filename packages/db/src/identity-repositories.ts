import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { TrevvDatabase } from "./repositories.js";
import {
  createOrganizationScope,
  createPostgresRepositories,
  fingerprintRequest,
  RepositoryError,
} from "./repositories.js";
import {
  appUserOrganizationSelections,
  auditLogs,
  authUserMappings,
  authUsers,
  blueprintInstances,
  blueprints,
  blueprintVersions,
  boards,
  invitations,
  memberships,
  onboardingProgress,
  organizations,
  outboxEvents,
  portfolioMembers,
  portfolios,
  users,
  workspaceMembers,
  workspaces,
} from "./schema.js";

declare const identityScopeBrand: unique symbol;
declare const invitationTokenHashBrand: unique symbol;

/** A server-only scope constructed from the resolved Better Auth session. */
export type IdentityScope = {
  authUserId: string;
  requestId: string;
  readonly [identityScopeBrand]: "IdentityScope";
};

export type InvitationTokenHash = string & {
  readonly [invitationTokenHashBrand]: "InvitationTokenHash";
};

// The shared Zod contract carries this as a bounded integer rather than a
// literal union; repository validation still enforces 1..5 at runtime.
export type OnboardingStep = number;
export type OnboardingBlueprintKey =
  | "operating_business"
  | "client_delivery"
  | "product_initiative"
  | "launch_campaign"
  | "blank";

export interface OnboardingDraft {
  step: OnboardingStep;
  organizationName?: string;
  organizationSlug?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  workspaceType?: (typeof workspaces.$inferInsert)["type"];
  workspaceColor?: string;
  blueprintKey?: OnboardingBlueprintKey;
}

export interface CompleteOnboardingInput {
  step: 5;
  organizationName: string;
  organizationSlug: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceType: (typeof workspaces.$inferInsert)["type"];
  workspaceColor: string;
  blueprintKey: OnboardingBlueprintKey;
}

export interface OnboardingCompletionContext {
  idempotencyKey: string;
  requestFingerprint?: string;
  now?: Date;
}

export interface OnboardingResult {
  appUserId: string;
  organizationId: string;
  portfolioId: string;
  workspaceId: string;
  boardId: string;
  blueprintId: string;
  blueprintInstanceId: string;
  replayed: boolean;
}

export interface OnboardingProgressProjection {
  status: "in_progress" | "completed";
  step: OnboardingStep;
  draft: Omit<OnboardingDraft, "step">;
  version: number;
  completedAt: Date | null;
  result: Omit<OnboardingResult, "replayed"> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationChoice {
  id: string;
  name: string;
  slug: string;
  role: (typeof memberships.$inferSelect)["role"];
}

interface IdentityBase {
  authUser: Pick<
    typeof authUsers.$inferSelect,
    "id" | "name" | "email" | "emailVerified"
  >;
}

export type IdentityResolution =
  | (IdentityBase & { status: "verification_required" })
  | (IdentityBase & { status: "onboarding_required" })
  | (IdentityBase & {
      status: "organization_selection_required";
      appUser: typeof users.$inferSelect;
      organizations: OrganizationChoice[];
    })
  | (IdentityBase & {
      status: "access_unavailable";
      appUser: typeof users.$inferSelect;
    })
  | (IdentityBase & {
      status: "active";
      appUser: typeof users.$inferSelect;
      organization: typeof organizations.$inferSelect;
      membership: typeof memberships.$inferSelect;
      portfolioIds: string[];
      managedPortfolioIds: string[];
      workspaceIds: string[];
      managedWorkspaceIds: string[];
      availableOrganizations: OrganizationChoice[];
      organizations: OrganizationChoice[];
    });

export interface AcceptedInvitationResult {
  invitationId: string;
  organizationId: string;
  appUserId: string;
  membership: typeof memberships.$inferSelect;
}

export interface IdentityRepositories {
  resolve: () => Promise<IdentityResolution>;
  selectOrganization: (organizationId: string) => Promise<IdentityResolution>;
  onboarding: {
    getProgress: () => Promise<OnboardingProgressProjection | null>;
    saveProgress: (
      draft: OnboardingDraft,
      expectedVersion?: number,
    ) => Promise<OnboardingProgressProjection>;
    complete: (
      input: CompleteOnboardingInput,
      context: OnboardingCompletionContext,
    ) => Promise<OnboardingResult>;
  };
  invitations: {
    accept: (
      tokenHash: InvitationTokenHash,
      now?: Date,
    ) => Promise<AcceptedInvitationResult>;
  };
}

export function createIdentityScope(input: {
  authUserId: string;
  requestId: string;
}): IdentityScope {
  if (!input.authUserId.trim() || !input.requestId.trim())
    throw unavailable("Auth user and request identity are required.");
  return Object.freeze({ ...input }) as IdentityScope;
}

/**
 * Hashes a high-entropy opaque token for storage. Token generation and email
 * delivery remain outside the repository; only this one-way digest crosses the
 * persistence boundary.
 */
export function hashInvitationToken(rawToken: string): InvitationTokenHash {
  if (rawToken.length < 32)
    throw unavailable("Invitation tokens must contain at least 32 characters.");
  return createHash("sha256")
    .update(rawToken)
    .digest("hex") as InvitationTokenHash;
}

export function asInvitationTokenHash(value: string): InvitationTokenHash {
  if (!/^[a-f0-9]{64}$/u.test(value))
    throw unavailable("A SHA-256 invitation token hash is required.");
  return value as InvitationTokenHash;
}

export function createIdentityRepositories(
  database: TrevvDatabase,
  scope: IdentityScope,
): IdentityRepositories {
  assertIdentityScope(scope);
  return {
    resolve: () => resolveIdentity(database, scope),
    selectOrganization: async (organizationId) => {
      await selectOrganization(database, scope, organizationId);
      return resolveIdentity(database, scope);
    },
    onboarding: {
      getProgress: () => getOnboardingProgress(database, scope),
      saveProgress: (draft, expectedVersion) =>
        saveOnboardingProgress(database, scope, draft, expectedVersion),
      complete: (input, context) =>
        completeOnboarding(database, scope, input, context),
    },
    invitations: {
      accept: (tokenHash, now) =>
        acceptInvitation(database, scope, tokenHash, now),
    },
  };
}

async function resolveIdentity(
  database: TrevvDatabase,
  scope: IdentityScope,
): Promise<IdentityResolution> {
  const authUser = await getAuthUser(database, scope.authUserId);
  const authUserProjection = projectAuthUser(authUser);
  if (!authUser.emailVerified)
    return { status: "verification_required", authUser: authUserProjection };

  const mappedUser = await getMappedAppUser(database, scope.authUserId);
  if (!mappedUser)
    return { status: "onboarding_required", authUser: authUserProjection };

  const choices = await listActiveOrganizationChoices(database, mappedUser.id);
  if (!choices.length)
    return {
      status: "access_unavailable",
      authUser: authUserProjection,
      appUser: mappedUser,
    };

  const [selection] = await database
    .select({ organizationId: appUserOrganizationSelections.organizationId })
    .from(appUserOrganizationSelections)
    .innerJoin(
      memberships,
      and(
        eq(
          memberships.organizationId,
          appUserOrganizationSelections.organizationId,
        ),
        eq(memberships.userId, appUserOrganizationSelections.appUserId),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
      ),
    )
    .where(eq(appUserOrganizationSelections.appUserId, mappedUser.id))
    .limit(1);

  let organizationId = selection?.organizationId;
  if (!organizationId && choices.length === 1) {
    organizationId = choices[0]!.id;
    await persistOrganizationSelection(
      database,
      mappedUser.id,
      organizationId,
      new Date(),
    );
  }
  if (!organizationId)
    return {
      status: "organization_selection_required",
      authUser: authUserProjection,
      appUser: mappedUser,
      organizations: choices,
    };

  const session = await createPostgresRepositories(database)
    .forOrganization(
      createOrganizationScope({
        organizationId,
        userId: mappedUser.id,
        requestId: scope.requestId,
      }),
    )
    .session.resolve();
  return {
    status: "active",
    authUser: authUserProjection,
    appUser: session.user,
    organization: session.organization,
    membership: session.membership,
    portfolioIds: session.portfolioIds,
    managedPortfolioIds: session.managedPortfolioIds,
    workspaceIds: session.workspaceIds,
    managedWorkspaceIds: session.managedWorkspaceIds,
    availableOrganizations: choices,
    organizations: choices,
  };
}

async function selectOrganization(
  database: TrevvDatabase,
  scope: IdentityScope,
  organizationId: string,
) {
  if (!organizationId.trim()) throw notFound();
  await database.transaction(async (rawTransaction) => {
    const transaction = rawTransaction as unknown as TrevvDatabase;
    const authUser = await getVerifiedAuthUser(transaction, scope.authUserId);
    const appUser = await getMappedAppUser(transaction, authUser.id);
    if (!appUser) throw identityAccessUnavailable();
    const [activeMembership] = await transaction
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, appUser.id),
          isNull(memberships.archivedAt),
          isNull(memberships.deletedAt),
        ),
      )
      .limit(1);
    if (!activeMembership) throw notFound();
    await persistOrganizationSelection(
      transaction,
      appUser.id,
      organizationId,
      new Date(),
    );
  });
}

async function getOnboardingProgress(
  database: TrevvDatabase,
  scope: IdentityScope,
) {
  await getVerifiedAuthUser(database, scope.authUserId);
  const [progress] = await database
    .select()
    .from(onboardingProgress)
    .where(eq(onboardingProgress.authUserId, scope.authUserId))
    .limit(1);
  return progress ? projectOnboardingProgress(progress) : null;
}

async function saveOnboardingProgress(
  database: TrevvDatabase,
  scope: IdentityScope,
  input: OnboardingDraft,
  expectedVersion?: number,
) {
  return database.transaction(async (rawTransaction) => {
    const transaction = rawTransaction as unknown as TrevvDatabase;
    await getVerifiedAuthUser(transaction, scope.authUserId, true);
    const now = new Date();
    const sanitizedDraft = sanitizeOnboardingDraft(input);
    const [inserted] = await transaction
      .insert(onboardingProgress)
      .values({
        authUserId: scope.authUserId,
        step: String(normalizeStep(input.step)),
        draft: sanitizedDraft,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: onboardingProgress.authUserId })
      .returning();
    if (inserted) {
      if (expectedVersion !== undefined && expectedVersion !== 0)
        throw versionConflict(0);
      return projectOnboardingProgress(inserted);
    }
    const [existing] = await transaction
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.authUserId, scope.authUserId))
      .limit(1)
      .for("update");
    if (!existing) throw unavailable("Onboarding progress could not be saved.");
    if (existing.status === "completed")
      throw onboardingConflict("Onboarding is already complete.");
    if (expectedVersion !== undefined && existing.version !== expectedVersion)
      throw versionConflict(existing.version);
    const draft = {
      ...parseOnboardingDraft(existing.draft),
      ...sanitizedDraft,
    };
    const [updated] = await transaction
      .update(onboardingProgress)
      .set({
        step: String(normalizeStep(input.step)),
        draft,
        version: sql`${onboardingProgress.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(onboardingProgress.authUserId, scope.authUserId),
          eq(onboardingProgress.version, existing.version),
          eq(onboardingProgress.status, "draft"),
        ),
      )
      .returning();
    if (!updated) throw versionConflict(existing.version);
    return projectOnboardingProgress(updated);
  });
}

async function completeOnboarding(
  database: TrevvDatabase,
  scope: IdentityScope,
  rawInput: CompleteOnboardingInput,
  context: OnboardingCompletionContext,
): Promise<OnboardingResult> {
  const idempotencyKey = context.idempotencyKey.trim();
  if (!idempotencyKey)
    throw unavailable("An onboarding idempotency key is required.");
  const input = sanitizeCompleteOnboarding(rawInput);
  const requestFingerprint =
    context.requestFingerprint ?? fingerprintRequest(input);
  const now = context.now ?? new Date();

  try {
    return await database.transaction(async (rawTransaction) => {
      const transaction = rawTransaction as unknown as TrevvDatabase;
      const authUser = await getVerifiedAuthUser(
        transaction,
        scope.authUserId,
        true,
      );
      await transaction
        .insert(onboardingProgress)
        .values({
          authUserId: scope.authUserId,
          step: "5",
          draft: sanitizeOnboardingDraft(input),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: onboardingProgress.authUserId });
      const [progress] = await transaction
        .select()
        .from(onboardingProgress)
        .where(eq(onboardingProgress.authUserId, scope.authUserId))
        .limit(1)
        .for("update");
      if (!progress)
        throw unavailable("Onboarding progress could not be resolved.");
      if (progress.status === "completed") {
        if (
          progress.completionIdempotencyKey !== idempotencyKey ||
          progress.completionRequestFingerprint !== requestFingerprint
        )
          throw onboardingConflict(
            "This identity has already completed onboarding.",
          );
        return { ...requireOnboardingResult(progress), replayed: true };
      }

      if (await getMappedAppUser(transaction, authUser.id))
        throw onboardingConflict(
          "This identity is already mapped to an application user.",
        );
      const appUser = await ensureApplicationUser(transaction, authUser, now);
      const [existingMembership] = await transaction
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, appUser.id),
            isNull(memberships.archivedAt),
            isNull(memberships.deletedAt),
          ),
        )
        .limit(1);
      if (existingMembership)
        throw onboardingConflict(
          "This identity already belongs to an active organization.",
        );

      const organizationId = randomUUID();
      const portfolioId = randomUUID();
      const workspaceId = randomUUID();
      const boardId = randomUUID();
      const blueprintId = randomUUID();
      const blueprintVersionId = randomUUID();
      const blueprintInstanceId = randomUUID();
      const starter = starterBlueprint(input.blueprintKey);

      await transaction.insert(organizations).values({
        id: organizationId,
        name: input.organizationName,
        slug: input.organizationSlug,
        locale: "en",
        timezone: "Europe/Berlin",
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(memberships).values({
        organizationId,
        userId: appUser.id,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(portfolios).values({
        id: portfolioId,
        organizationId,
        name: "Company",
        slug: "company",
        description: "The default company portfolio.",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(portfolioMembers).values({
        organizationId,
        portfolioId,
        userId: appUser.id,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(workspaces).values({
        id: workspaceId,
        organizationId,
        portfolioId,
        name: input.workspaceName,
        slug: input.workspaceSlug,
        type: input.workspaceType,
        accentColor: input.workspaceColor,
        icon: input.workspaceName.slice(0, 1).toLocaleUpperCase("en-US"),
        visibility: "private",
        lifecycleStage: "build",
        health: "on_track",
        leadUserId: appUser.id,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(workspaceMembers).values({
        organizationId,
        workspaceId,
        userId: appUser.id,
        canManage: true,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(boards).values({
        id: boardId,
        organizationId,
        workspaceId,
        name: starter.boardName,
        description: starter.description,
        templateKey: input.blueprintKey,
        visibility: "private",
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(blueprints).values({
        id: blueprintId,
        organizationId,
        name: starter.name,
        description: starter.description,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(blueprintVersions).values({
        id: blueprintVersionId,
        organizationId,
        blueprintId,
        version: 1,
        summary: `Initial ${starter.name} Blueprint`,
        definition: starter.definition,
        createdBy: appUser.id,
        createdAt: now,
      });
      await transaction
        .update(blueprints)
        .set({ currentVersionId: blueprintVersionId, updatedAt: now })
        .where(
          and(
            eq(blueprints.organizationId, organizationId),
            eq(blueprints.id, blueprintId),
          ),
        );
      await transaction.insert(blueprintInstances).values({
        id: blueprintInstanceId,
        organizationId,
        blueprintId,
        blueprintVersionId,
        workspaceId,
        boardId,
        createdAt: now,
        updatedAt: now,
      });
      await persistOrganizationSelection(
        transaction,
        appUser.id,
        organizationId,
        now,
      );
      await appendAuditAndOutbox(
        transaction,
        {
          organizationId,
          userId: appUser.id,
          requestId: scope.requestId,
        },
        {
          action: "organization.onboarded",
          aggregateType: "organization",
          aggregateId: organizationId,
          eventType: "organization.onboarded",
          payload: {
            portfolioId,
            workspaceId,
            boardId,
            blueprintId,
            blueprintInstanceId,
            blueprintKey: input.blueprintKey,
          },
          now,
        },
      );
      const [completed] = await transaction
        .update(onboardingProgress)
        .set({
          appUserId: appUser.id,
          status: "completed",
          step: "5",
          draft: sanitizeOnboardingDraft(input),
          version: sql`${onboardingProgress.version} + 1`,
          completionIdempotencyKey: idempotencyKey,
          completionRequestFingerprint: requestFingerprint,
          completedOrganizationId: organizationId,
          completedPortfolioId: portfolioId,
          completedWorkspaceId: workspaceId,
          completedBoardId: boardId,
          completedBlueprintId: blueprintId,
          completedBlueprintInstanceId: blueprintInstanceId,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(onboardingProgress.authUserId, scope.authUserId),
            eq(onboardingProgress.status, "draft"),
          ),
        )
        .returning();
      if (!completed)
        throw unavailable("Onboarding completion could not be persisted.");
      return {
        appUserId: appUser.id,
        organizationId,
        portfolioId,
        workspaceId,
        boardId,
        blueprintId,
        blueprintInstanceId,
        replayed: false,
      };
    });
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    if (isUniqueViolation(error))
      throw new RepositoryError(
        "constraint_conflict",
        "The requested organization or Workspace identifier is already in use.",
      );
    throw error;
  }
}

async function acceptInvitation(
  database: TrevvDatabase,
  scope: IdentityScope,
  tokenHash: InvitationTokenHash,
  requestedNow?: Date,
): Promise<AcceptedInvitationResult> {
  asInvitationTokenHash(tokenHash);
  const now = requestedNow ?? new Date();
  return database.transaction(async (rawTransaction) => {
    const transaction = rawTransaction as unknown as TrevvDatabase;
    const authUser = await getVerifiedAuthUser(
      transaction,
      scope.authUserId,
      true,
    );
    const [invitation] = await transaction
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, tokenHash),
          isNull(invitations.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (
      !invitation ||
      invitation.acceptedAt !== null ||
      invitation.revokedAt !== null ||
      invitation.expiresAt.getTime() <= now.getTime() ||
      normalizeEmail(invitation.email) !== normalizeEmail(authUser.email)
    )
      throw invalidInvitation();

    const appUser = await ensureApplicationUser(transaction, authUser, now);
    const [existingMembership] = await transaction
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, invitation.organizationId),
          eq(memberships.userId, appUser.id),
        ),
      )
      .limit(1)
      .for("update");
    let membership: typeof memberships.$inferSelect | undefined;
    if (existingMembership) {
      if (
        existingMembership.archivedAt === null &&
        existingMembership.deletedAt === null
      )
        throw invalidInvitation();
      [membership] = await transaction
        .update(memberships)
        .set({
          role: invitation.role,
          archivedAt: null,
          deletedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(memberships.organizationId, invitation.organizationId),
            eq(memberships.userId, appUser.id),
          ),
        )
        .returning();
    } else {
      [membership] = await transaction
        .insert(memberships)
        .values({
          organizationId: invitation.organizationId,
          userId: appUser.id,
          role: invitation.role,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    }
    if (!membership) throw invalidInvitation();

    const [accepted] = await transaction
      .update(invitations)
      .set({
        acceptedAt: now,
        acceptedByUserId: appUser.id,
        version: sql`${invitations.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(invitations.organizationId, invitation.organizationId),
          eq(invitations.id, invitation.id),
          eq(invitations.version, invitation.version),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          isNull(invitations.deletedAt),
        ),
      )
      .returning({ id: invitations.id });
    if (!accepted) throw invalidInvitation();
    await persistOrganizationSelection(
      transaction,
      appUser.id,
      invitation.organizationId,
      now,
    );
    await appendAuditAndOutbox(
      transaction,
      {
        organizationId: invitation.organizationId,
        userId: appUser.id,
        requestId: scope.requestId,
      },
      {
        action: "invitation.accepted",
        aggregateType: "invitation",
        aggregateId: invitation.id,
        eventType: "invitation.accepted",
        payload: { membershipRole: invitation.role },
        now,
      },
    );
    return {
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      appUserId: appUser.id,
      membership,
    };
  });
}

async function getAuthUser(
  database: TrevvDatabase,
  authUserId: string,
  lock = false,
) {
  const query = database
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, authUserId))
    .limit(1);
  const [authUser] = lock ? await query.for("update") : await query;
  if (!authUser) throw identityAccessUnavailable();
  return authUser;
}

async function getVerifiedAuthUser(
  database: TrevvDatabase,
  authUserId: string,
  lock = false,
) {
  const authUser = await getAuthUser(database, authUserId, lock);
  if (!authUser.emailVerified)
    throw new RepositoryError(
      "identity_not_verified",
      "Email verification is required before this action.",
    );
  return authUser;
}

async function getMappedAppUser(database: TrevvDatabase, authUserId: string) {
  const [row] = await database
    .select({ user: users })
    .from(authUserMappings)
    .innerJoin(users, eq(users.id, authUserMappings.appUserId))
    .where(
      and(
        eq(authUserMappings.authUserId, authUserId),
        isNull(users.archivedAt),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return row?.user;
}

async function ensureApplicationUser(
  database: TrevvDatabase,
  authUser: typeof authUsers.$inferSelect,
  now: Date,
) {
  const mapped = await getMappedAppUser(database, authUser.id);
  if (mapped) return mapped;

  const normalizedEmail = normalizeEmail(authUser.email);
  const [existingUser] = await database
    .select()
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = ${normalizedEmail}`,
        isNull(users.deletedAt),
      ),
    )
    .limit(1)
    .for("update");
  const appUser =
    existingUser ??
    (
      await database
        .insert(users)
        .values({
          id: randomUUID(),
          email: normalizedEmail,
          name: requiredText(authUser.name, "Account name"),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0];
  if (!appUser) throw unavailable("Application user mapping failed.");
  const [mapping] = await database
    .insert(authUserMappings)
    .values({
      authUserId: authUser.id,
      appUserId: appUser.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: authUserMappings.authUserId })
    .returning();
  if (!mapping) throw identityAccessUnavailable();
  return appUser;
}

async function listActiveOrganizationChoices(
  database: TrevvDatabase,
  appUserId: string,
): Promise<OrganizationChoice[]> {
  return database
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(
        eq(memberships.userId, appUserId),
        isNull(memberships.archivedAt),
        isNull(memberships.deletedAt),
        isNull(organizations.archivedAt),
        isNull(organizations.deletedAt),
      ),
    )
    .orderBy(asc(memberships.createdAt), asc(organizations.id));
}

async function persistOrganizationSelection(
  database: TrevvDatabase,
  appUserId: string,
  organizationId: string,
  now: Date,
) {
  const [selection] = await database
    .insert(appUserOrganizationSelections)
    .values({
      appUserId,
      organizationId,
      selectedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appUserOrganizationSelections.appUserId,
      set: { organizationId, selectedAt: now, updatedAt: now },
    })
    .returning();
  if (!selection) throw identityAccessUnavailable();
  return selection;
}

async function appendAuditAndOutbox(
  database: TrevvDatabase,
  scope: { organizationId: string; userId: string; requestId: string },
  input: {
    action: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    now: Date;
  },
) {
  const payload = { requestId: scope.requestId, ...input.payload };
  const dedupKey = fingerprintRequest({
    requestId: scope.requestId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
  });
  await database.insert(auditLogs).values({
    id: randomUUID(),
    organizationId: scope.organizationId,
    actorId: scope.userId,
    action: input.action,
    targetType: input.aggregateType,
    targetId: input.aggregateId,
    payload,
    createdAt: input.now,
  });
  await database.insert(outboxEvents).values({
    id: randomUUID(),
    organizationId: scope.organizationId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    actorId: scope.userId,
    requestId: scope.requestId,
    correlationId: scope.requestId,
    dedupKey,
    payload,
    availableAt: input.now,
    createdAt: input.now,
  });
}

function projectAuthUser(authUser: typeof authUsers.$inferSelect) {
  return {
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
    emailVerified: authUser.emailVerified,
  };
}

function projectOnboardingProgress(
  progress: typeof onboardingProgress.$inferSelect,
): OnboardingProgressProjection {
  const result =
    progress.status === "completed" ? requireOnboardingResult(progress) : null;
  return {
    status: progress.status === "draft" ? "in_progress" : "completed",
    step: parseOnboardingStep(progress.step),
    draft: parseOnboardingDraft(progress.draft),
    version: progress.version,
    completedAt: progress.completedAt,
    result,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
  };
}

function requireOnboardingResult(
  progress: typeof onboardingProgress.$inferSelect,
): Omit<OnboardingResult, "replayed"> {
  if (
    !progress.appUserId ||
    !progress.completedOrganizationId ||
    !progress.completedPortfolioId ||
    !progress.completedWorkspaceId ||
    !progress.completedBoardId ||
    !progress.completedBlueprintId ||
    !progress.completedBlueprintInstanceId
  )
    throw unavailable("Stored onboarding completion is incomplete.");
  return {
    appUserId: progress.appUserId,
    organizationId: progress.completedOrganizationId,
    portfolioId: progress.completedPortfolioId,
    workspaceId: progress.completedWorkspaceId,
    boardId: progress.completedBoardId,
    blueprintId: progress.completedBlueprintId,
    blueprintInstanceId: progress.completedBlueprintInstanceId,
  };
}

function sanitizeCompleteOnboarding(
  input: CompleteOnboardingInput,
): CompleteOnboardingInput {
  if (input.step !== 5)
    throw unavailable("Onboarding completion requires step 5.");
  return {
    step: 5,
    organizationName: requiredText(input.organizationName, "Organization name"),
    organizationSlug: requiredSlug(input.organizationSlug, "Organization slug"),
    workspaceName: requiredText(input.workspaceName, "Workspace name"),
    workspaceSlug: requiredSlug(input.workspaceSlug, "Workspace slug"),
    workspaceType: input.workspaceType,
    workspaceColor: requiredColor(input.workspaceColor),
    blueprintKey: requireBlueprintKey(input.blueprintKey),
  };
}

function sanitizeOnboardingDraft(
  input: OnboardingDraft,
): Omit<OnboardingDraft, "step"> {
  const result: Omit<OnboardingDraft, "step"> = {};
  if (input.organizationName !== undefined)
    result.organizationName = requiredText(
      input.organizationName,
      "Organization name",
    );
  if (input.organizationSlug !== undefined)
    result.organizationSlug = requiredSlug(
      input.organizationSlug,
      "Organization slug",
    );
  if (input.workspaceName !== undefined)
    result.workspaceName = requiredText(input.workspaceName, "Workspace name");
  if (input.workspaceSlug !== undefined)
    result.workspaceSlug = requiredSlug(input.workspaceSlug, "Workspace slug");
  if (input.workspaceType !== undefined)
    result.workspaceType = input.workspaceType;
  if (input.workspaceColor !== undefined)
    result.workspaceColor = requiredColor(input.workspaceColor);
  if (input.blueprintKey !== undefined)
    result.blueprintKey = requireBlueprintKey(input.blueprintKey);
  return result;
}

function parseOnboardingDraft(value: unknown): Omit<OnboardingDraft, "step"> {
  if (!isRecord(value)) return {};
  const draft: OnboardingDraft = { step: 1 };
  const organizationName = optionalString(value.organizationName);
  const organizationSlug = optionalString(value.organizationSlug);
  const workspaceName = optionalString(value.workspaceName);
  const workspaceSlug = optionalString(value.workspaceSlug);
  const workspaceColor = optionalString(value.workspaceColor);
  if (organizationName !== undefined) draft.organizationName = organizationName;
  if (organizationSlug !== undefined) draft.organizationSlug = organizationSlug;
  if (workspaceName !== undefined) draft.workspaceName = workspaceName;
  if (workspaceSlug !== undefined) draft.workspaceSlug = workspaceSlug;
  if (isWorkspaceType(value.workspaceType))
    draft.workspaceType = value.workspaceType;
  if (workspaceColor !== undefined) draft.workspaceColor = workspaceColor;
  if (isBlueprintKey(value.blueprintKey))
    draft.blueprintKey = value.blueprintKey;
  return sanitizeOnboardingDraft(draft);
}

function isWorkspaceType(
  value: unknown,
): value is (typeof workspaces.$inferInsert)["type"] {
  return (
    typeof value === "string" &&
    [
      "business",
      "brand",
      "client",
      "product",
      "department",
      "venture",
      "initiative",
      "investment",
      "campaign",
      "program",
      "project",
      "shared_function",
      "client_program",
      "journey",
      "other",
    ].includes(value)
  );
}

function isBlueprintKey(value: unknown): value is OnboardingBlueprintKey {
  return (
    value === "operating_business" ||
    value === "client_delivery" ||
    value === "product_initiative" ||
    value === "launch_campaign" ||
    value === "blank"
  );
}

function requireBlueprintKey(value: unknown): OnboardingBlueprintKey {
  if (!isBlueprintKey(value))
    throw unavailable("Onboarding Blueprint selection is invalid.");
  return value;
}

function starterBlueprint(key: OnboardingBlueprintKey) {
  const templates = {
    operating_business: {
      name: "Operating business",
      boardName: "Operating rhythm",
      description: "A focused operating loop for recurring company work.",
      groups: ["Next", "In progress", "Review", "Done"],
    },
    client_delivery: {
      name: "Client delivery",
      boardName: "Client delivery",
      description: "A clear path from client intake through delivery.",
      groups: ["Intake", "Active", "Client review", "Done"],
    },
    product_initiative: {
      name: "Product initiative",
      boardName: "Product initiative",
      description: "A lightweight product discovery and delivery loop.",
      groups: ["Explore", "Shape", "Build", "Validate"],
    },
    launch_campaign: {
      name: "Launch campaign",
      boardName: "Launch campaign",
      description: "A coordinated path from preparation through launch.",
      groups: ["Plan", "Prepare", "Launch", "Learn"],
    },
    blank: {
      name: "Blank starter",
      boardName: "Starter board",
      description: "A minimal private board ready for the first work item.",
      groups: ["Work"],
    },
  } as const;
  const selected = templates[key];
  return {
    ...selected,
    definition: {
      key,
      board: { name: selected.boardName, groups: [...selected.groups] },
    },
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function normalizeStep(value: number): OnboardingStep {
  if (!Number.isInteger(value) || value < 1 || value > 5)
    throw unavailable("Onboarding step is invalid.");
  return value;
}

function parseOnboardingStep(value: string): OnboardingStep {
  return normalizeStep(Number(value));
}

function requiredColor(value: string) {
  const color = value.trim().toLocaleLowerCase("en-US");
  if (!/^#[0-9a-f]{6}$/u.test(color))
    throw unavailable("Workspace color is invalid.");
  return color;
}

function requiredSlug(value: string, label: string) {
  const slug = requiredText(value, label).toLocaleLowerCase("en-US");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug))
    throw unavailable(`${label} is invalid.`);
  return slug;
}

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160)
    throw unavailable(`${label} is invalid.`);
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.code === "23505" ||
      (isRecord(error.cause) && error.cause.code === "23505"))
  );
}

function assertIdentityScope(scope: IdentityScope) {
  if (!scope.authUserId.trim() || !scope.requestId.trim())
    throw unavailable("Auth user and request identity are required.");
}

function versionConflict(currentVersion: number) {
  return new RepositoryError(
    "version_conflict",
    "Onboarding progress changed before this update was committed.",
    { currentVersion },
  );
}

function onboardingConflict(message: string) {
  return new RepositoryError("onboarding_conflict", message);
}

function invalidInvitation() {
  return new RepositoryError(
    "invitation_invalid",
    "This invitation is invalid, expired, revoked, already used, or belongs to another verified email address.",
  );
}

function identityAccessUnavailable() {
  return new RepositoryError(
    "identity_access_unavailable",
    "No active application access is available for this identity.",
  );
}

function notFound() {
  return new RepositoryError(
    "resource_not_found",
    "The requested resource is unavailable.",
  );
}

function unavailable(message: string) {
  return new RepositoryError("repository_unavailable", message);
}
