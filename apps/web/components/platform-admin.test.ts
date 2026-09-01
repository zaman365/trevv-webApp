import { describe, expect, it } from "vitest";
import type { PlatformInvitation, PlatformUser } from "@founderhq/api-contract";
import {
  filterPlatformInvitations,
  filterPlatformUsers,
} from "./platform-admin";

const user: PlatformUser = {
  authUserId: "auth-owner",
  appUserId: "user-owner",
  name: "Platform Owner",
  email: "owner@example.test",
  emailVerified: true,
  activeSessionCount: 1,
  memberships: [
    {
      organizationId: "org-one",
      organizationName: "Example Company",
      role: "owner",
      active: true,
    },
  ],
  createdAt: "2026-09-01T10:00:00.000Z",
};

const invitation: PlatformInvitation = {
  id: "invitation-one",
  organizationId: "org-one",
  organizationName: "Example Company",
  email: "invitee@example.test",
  role: "member",
  status: "pending",
  deliveryStatus: "failed",
  sendCount: 2,
  version: 1,
  expiresAt: "2026-09-08T10:00:00.000Z",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

describe("platform console filtering", () => {
  it("finds people by account and organization fields", () => {
    expect(filterPlatformUsers([user], "owner@example")).toEqual([user]);
    expect(filterPlatformUsers([user], "example company")).toEqual([user]);
    expect(filterPlatformUsers([user], "missing")).toEqual([]);
  });

  it("finds invitations by delivery and tenant fields", () => {
    expect(filterPlatformInvitations([invitation], "failed")).toEqual([
      invitation,
    ]);
    expect(filterPlatformInvitations([invitation], "example company")).toEqual([
      invitation,
    ]);
    expect(filterPlatformInvitations([invitation], "sent")).toEqual([]);
  });
});
