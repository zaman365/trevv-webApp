import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const created = () =>
  timestamp("createdAt", { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow();

// This realm has no foreign keys to customer identities or memberships.
export const superadminUsers = pgTable(
  "superadmin_user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("auditor"),
    disabled: boolean("disabled").notNull().default(false),
    phoneNumber: text("phoneNumber"),
    twoFactorEnabled: boolean("twoFactorEnabled").notNull().default(false),
    admissionTokenHash: text("admissionTokenHash"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    uniqueIndex("superadmin_user_email_unique").on(sql`lower(${table.email})`),
    check(
      "superadmin_user_role_check",
      sql`${table.role} in ('owner', 'operator', 'auditor')`,
    ),
    check(
      "superadmin_user_phone_check",
      sql`${table.phoneNumber} is null or ${table.phoneNumber} ~ '^[+][1-9][0-9]{6,14}$'`,
    ),
  ],
);

export const superadminSessions = pgTable(
  "superadmin_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => superadminUsers.id, { onDelete: "cascade" }),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    // Only a successful factor verification hook can set this server-side field.
    assuranceAt: timestamp("assuranceAt", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    uniqueIndex("superadmin_session_token_unique").on(table.token),
    index("superadmin_session_user_idx").on(table.userId),
  ],
);

export const superadminAccounts = pgTable(
  "superadmin_account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    issuer: text("issuer").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => superadminUsers.id, { onDelete: "cascade" }),
    password: text("password"),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    uniqueIndex("superadmin_account_issuer_unique").on(
      table.issuer,
      table.accountId,
    ),
    index("superadmin_account_user_idx").on(table.userId),
  ],
);

export const superadminVerifications = pgTable(
  "superadmin_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [
    index("superadmin_verification_identifier_idx").on(table.identifier),
  ],
);

export const superadminTwoFactors = pgTable(
  "superadmin_two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backupCodes").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => superadminUsers.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(false),
    failedVerificationCount: integer("failedVerificationCount")
      .notNull()
      .default(0),
    lockedUntil: timestamp("lockedUntil", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("superadmin_two_factor_user_unique").on(table.userId),
  ],
);

export const superadminPasskeys = pgTable(
  "superadmin_passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("publicKey").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => superadminUsers.id, { onDelete: "cascade" }),
    credentialID: text("credentialID").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("deviceType").notNull(),
    backedUp: boolean("backedUp").notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: created(),
  },
  (table) => [
    uniqueIndex("superadmin_passkey_credential_unique").on(table.credentialID),
    index("superadmin_passkey_user_idx").on(table.userId),
  ],
);

export const superadminInvitations = pgTable(
  "superadmin_invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").references(() => superadminUsers.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    deliveryStatus: text("delivery_status").notNull().default("pending"),
    createdAt: created(),
  },
  (table) => [
    uniqueIndex("superadmin_invitation_token_unique").on(table.tokenHash),
    uniqueIndex("superadmin_invitation_pending_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    check(
      "superadmin_invitation_role_check",
      sql`${table.role} in ('owner', 'operator', 'auditor')`,
    ),
    check(
      "superadmin_invitation_token_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const superadminAudit = pgTable(
  "superadmin_audit",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => superadminUsers.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("superadmin_audit_created_idx").on(table.createdAt),
    index("superadmin_audit_actor_idx").on(table.actorId),
  ],
);
