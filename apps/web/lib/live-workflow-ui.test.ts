import { describe, expect, it } from "vitest";
import {
  clearLiveDraftStorage,
  formatCompactWorkspaceDate,
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

  it("purges every private live draft without touching UI preferences", () => {
    const values = new Map([
      ["trevv:live-draft:v1:org-one:user-one:quick-capture", "private"],
      ["trevv:live-draft:v1:org-two:user-two:message%3Aroom", "private"],
      ["trevv:messages-layout:v1:org-one:user-one:workspace-one", "272"],
    ]);
    const storage = {
      get length() {
        return values.size;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(key);
      },
    };

    expect(clearLiveDraftStorage(storage)).toBe(2);
    expect([...values.keys()]).toEqual([
      "trevv:messages-layout:v1:org-one:user-one:workspace-one",
    ]);
  });

  it("does not block sign-out when browser storage is unavailable", () => {
    const storage = {
      get length(): number {
        throw new DOMException("Storage disabled", "SecurityError");
      },
      key: () => null,
      removeItem: () => undefined,
    };

    expect(clearLiveDraftStorage(storage)).toBe(0);
  });

  it("creates deterministic available workspace slugs", () => {
    expect(
      workspaceSlugFromName("München Launch", [
        "munchen-launch",
        "munchen-launch-2",
      ]),
    ).toBe("munchen-launch-3");
  });

  it("renders a safe empty milestone instead of throwing a RangeError", () => {
    expect(formatCompactWorkspaceDate("")).toBe("Not scheduled");
    expect(formatCompactWorkspaceDate("not-a-date")).toBe("Not scheduled");
    expect(formatCompactWorkspaceDate("2026-09-01")).toBe("Sep 1");
  });
});
