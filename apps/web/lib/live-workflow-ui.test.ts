import { describe, expect, it } from "vitest";
import {
  isLiveDraftEnvelope,
  liveDraftStorageKey,
  workspaceSlugFromName,
} from "./live-workflow-ui";

describe("live workflow UI helpers", () => {
  it("isolates recoverable drafts by organization, user, and purpose", () => {
    expect(
      liveDraftStorageKey({
        organizationId: "org-one",
        userId: "user-one",
        scope: "capture:workspace-one",
      }),
    ).toBe("trevv:live-draft:v1:org-one:user-one:capture%3Aworkspace-one");
    expect(
      liveDraftStorageKey({
        organizationId: "org-two",
        userId: "user-one",
        scope: "capture:workspace-one",
      }),
    ).not.toBe(
      liveDraftStorageKey({
        organizationId: "org-one",
        userId: "user-one",
        scope: "capture:workspace-one",
      }),
    );
  });

  it("keeps the same idempotency key in a valid retry envelope", () => {
    const value = {
      version: 1,
      idempotencyKey: "8f6b91d8-f493-46e8-923f-d1e644cd1ab3",
      payload: { title: "Follow up" },
      updatedAt: "2026-08-29T10:00:00.000Z",
    };
    expect(
      isLiveDraftEnvelope(value, (payload): payload is { title: string } =>
        Boolean(
          payload &&
          typeof payload === "object" &&
          typeof (payload as { title?: unknown }).title === "string",
        ),
      ),
    ).toBe(true);
    expect(value.idempotencyKey).toBe("8f6b91d8-f493-46e8-923f-d1e644cd1ab3");
  });

  it("creates deterministic available workspace slugs", () => {
    expect(
      workspaceSlugFromName("München Launch", [
        "munchen-launch",
        "munchen-launch-2",
      ]),
    ).toBe("munchen-launch-3");
  });
});
