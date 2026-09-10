import { z } from "zod";

export const superadminRoleSchema = z.enum(["owner", "operator", "auditor"]);
export const superadminSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: superadminRoleSchema,
  phoneNumber: z.string().nullable(),
  twoFactorEnabled: z.boolean(),
  expiresAt: z.string(),
  assuranceAt: z.string().nullable(),
});
export const superadminOverviewSchema = z.object({
  organizations: z.number().int().nonnegative(),
  users: z.number().int().nonnegative(),
  verifiedUsers: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  pendingInvitations: z.number().int().nonnegative(),
  failedDeliveries: z.number().int().nonnegative(),
  auditRetentionDays: z.number().int().positive(),
  missingContacts: z.number().int().nonnegative(),
  missingOwners: z.number().int().nonnegative(),
  reviewsDue: z.number().int().nonnegative(),
  newOrganizations: z.number().int().nonnegative(),
  operations: z
    .object({
      registrationMode: z.enum(["closed", "invite_only", "public"]),
      release: z
        .object({
          releaseId: z.string(),
          gitSha: z.string(),
          imageId: z.string(),
        })
        .nullable(),
      generatedAt: z.iso.datetime(),
    })
    .optional(),
});
export const superadminDirectoryKindSchema = z.enum([
  "organizations",
  "people",
  "invitations",
  "administrators",
  "audit",
]);
export const superadminDirectorySchema = z.object({
  items: z
    .array(
      z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
    )
    .max(100),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
});
export const superadminReasonSchema = z.string().trim().min(10).max(240);
export const superadminReasonInputSchema = z
  .object({ reason: superadminReasonSchema })
  .strict();
export const superadminContactFieldsSchema = z
  .object({
    kind: z.enum(["primary", "billing", "technical", "security", "other"]),
    name: z.string().trim().min(2).max(100),
    jobTitle: z.string().trim().max(100),
    email: z.string().trim().email().max(254),
    phone: z.union([z.literal(""), z.string().regex(/^\+[1-9]\d{6,14}$/u)]),
  })
  .strict();
export const superadminContactInputSchema = superadminContactFieldsSchema
  .extend({
    version: z.number().int().nonnegative(),
    reason: superadminReasonSchema,
  })
  .strict();
export const superadminContactDeleteSchema = superadminReasonInputSchema
  .extend({
    version: z.number().int().positive(),
  })
  .strict();
export const superadminOrganizationProfileSchema = z
  .object({
    legalName: z.string().trim().max(160),
    website: z.union([
      z.literal(""),
      z
        .string()
        .trim()
        .url()
        .max(300)
        .regex(/^https?:\/\//iu),
    ]),
    industry: z.string().trim().max(100),
    country: z.string().trim().max(80),
    city: z.string().trim().max(100),
    stage: z.enum(["onboarding", "established", "needs_review"]),
    priority: z.enum(["standard", "priority", "urgent"]),
    nextReviewAt: z.string().date().nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const superadminOrganizationUpdateSchema =
  superadminOrganizationProfileSchema
    .extend({
      reason: superadminReasonSchema,
    })
    .strict();
export const superadminContactSchema = z.object({
  id: z.string(),
  kind: superadminContactFieldsSchema.shape.kind,
  name: z.string(),
  jobTitle: z.string(),
  email: z.string(),
  phone: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});
export const superadminOrganizationDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  locale: z.string(),
  timezone: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  memberCount: z.number().int(),
  ownerCount: z.number().int(),
  workspaceCount: z.number().int(),
  pendingInvitations: z.number().int(),
  failedDeliveries: z.number().int(),
  profile: superadminOrganizationProfileSchema,
  contacts: z.array(superadminContactSchema).max(12),
});
export const superadminDirectoryFilters = {
  organizations: [
    "all",
    "missing_contact",
    "missing_owner",
    "onboarding",
    "needs_review",
    "review_due",
  ],
  people: ["all", "verified", "unverified", "has_sessions", "no_organization"],
  invitations: [
    "all",
    "pending",
    "expired",
    "accepted",
    "revoked",
    "delivery_failed",
  ],
  administrators: [
    "all",
    "owner",
    "operator",
    "auditor",
    "setup_pending",
    "disabled",
  ],
  audit: ["all", "changes", "contact_access", "reads", "legacy"],
} as const;
export const superadminDirectoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(0).max(40_000).default(0),
    q: z.string().max(100).default(""),
    filter: z.string().max(40).default("all"),
    organizationId: z.string().min(1).max(128).optional(),
  })
  .strict();
export const superadminContactSearchSchema = superadminDirectoryQuerySchema
  .extend({
    q: z.string().trim().min(3).max(100),
    reason: superadminReasonSchema,
  })
  .strict();
export const createSuperadminOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    ownerEmail: z.string().trim().email().max(254),
    contact: superadminContactFieldsSchema.optional(),
    reason: superadminReasonSchema,
  })
  .strict();
export const inviteSuperadminSchema = z
  .object({
    email: z.string().trim().email().max(254),
    role: superadminRoleSchema,
    reason: superadminReasonSchema,
  })
  .strict();
export const updateSuperadminSchema = z
  .object({
    role: superadminRoleSchema,
    disabled: z.boolean(),
    reason: superadminReasonSchema,
  })
  .strict();
export const superadminPhoneSchema = z
  .object({
    phoneNumber: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/u)
      .nullable(),
  })
  .strict();
export type SuperadminSession = z.infer<typeof superadminSessionSchema>;
export type SuperadminOrganizationDetail = z.infer<
  typeof superadminOrganizationDetailSchema
>;
export type SuperadminContact = z.infer<typeof superadminContactSchema>;
export type SuperadminOverview = z.infer<typeof superadminOverviewSchema>;
export type SuperadminDirectoryResult = z.infer<
  typeof superadminDirectorySchema
>;
export type SuperadminDirectoryKind = z.infer<
  typeof superadminDirectoryKindSchema
>;
