import { describe, expect, it } from "vitest";
import {
  can,
  PermissionError,
  requireAccess,
  type AccessContext,
} from "./index";

const context = (role: AccessContext["role"]): AccessContext => ({
  userId: "user-a",
  organizationId: "org-a",
  role,
  accessibleHubIds: new Set(["hub-a"]),
  managedHubIds: new Set(["hub-a"]),
});

describe("tenant authorization", () => {
  it("rejects cross-tenant resource identifiers for every role", () => {
    for (const role of [
      "owner",
      "admin",
      "hub_lead",
      "member",
      "guest",
      "viewer",
    ] as const)
      expect(
        can(context(role), "read", "item", {
          organizationId: "org-b",
          hubId: "hub-a",
        }),
      ).toBe(false);
  });
  it("does not reveal unrelated Hubs to a guest", () => {
    expect(
      can(context("guest"), "read", "hub", {
        organizationId: "org-a",
        hubId: "hub-unrelated",
        explicitlyShared: false,
      }),
    ).toBe(false);
    expect(() =>
      requireAccess(context("guest"), "read", "hub", {
        organizationId: "org-a",
        hubId: "hub-unrelated",
      }),
    ).toThrow(PermissionError);
  });
  it("keeps viewers read-only and allows Hub Leads to manage their Hub", () => {
    expect(
      can(context("viewer"), "update", "item", {
        organizationId: "org-a",
        hubId: "hub-a",
        explicitlyShared: true,
      }),
    ).toBe(false);
    expect(
      can(context("hub_lead"), "manage_members", "hub", {
        organizationId: "org-a",
        hubId: "hub-a",
      }),
    ).toBe(true);
    expect(
      can(context("hub_lead"), "update", "board", {
        organizationId: "org-a",
        hubId: "hub-a",
      }),
    ).toBe(true);
  });
});
