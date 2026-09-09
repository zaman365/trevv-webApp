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
export type SuperadminOverview = z.infer<typeof superadminOverviewSchema>;
export type SuperadminDirectoryResult = z.infer<
  typeof superadminDirectorySchema
>;
export type SuperadminDirectoryKind = z.infer<
  typeof superadminDirectoryKindSchema
>;
