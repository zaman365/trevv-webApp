import { describe, expect, it } from "vitest";
import { invitationAcceptanceUpstream } from "./invitation-recovery";

describe("invitation recovery", () => {
  it("uses the raw invitation capability when its scoped cookie is present", () => {
    expect(invitationAcceptanceUpstream("opaque-invitation-token")).toEqual({
      path: "/invitations/accept",
      init: {
        method: "POST",
        body: JSON.stringify({ token: "opaque-invitation-token" }),
      },
    });
  });

  it("uses the durable authenticated claim only when the raw cookie is absent", () => {
    expect(invitationAcceptanceUpstream(undefined)).toEqual({
      path: "/invitations/accept-claim",
      init: { method: "POST" },
    });
  });
});
