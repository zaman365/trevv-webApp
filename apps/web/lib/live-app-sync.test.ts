import { describe, expect, it, vi } from "vitest";
import { TrevvApiError, type TrevvApiClient } from "@founderhq/api-client";
import {
  createLiveAccessReader,
  readVerifiedSnapshot,
  retainsAccessScope,
  restrictSnapshotToAccess,
  type LiveAppAccessSnapshot,
} from "./live-app-sync";
import type { LiveAppDataSnapshot } from "./live-app-data";

const access = (revision: string | null = "one") =>
  ({
    protocol: 1,
    revision,
    checkedAt: "2026-09-05T00:00:00Z",
    session: {
      user: { id: "user", role: "owner" },
      organization: { id: "org", role: "owner" },
      managedWorkspaceIds: [],
    },
    portfolios: [{ id: "portfolio" }],
    workspaces: [{ id: "allowed" }],
  }) as unknown as LiveAppAccessSnapshot;
const snapshot = (): LiveAppDataSnapshot => ({
  portfolios: [],
  workspaces: [],
  items: [],
  waiting: [],
  attention: [],
  refreshedAt: "2026-09-05T00:00:00Z",
});

describe("cache preservation during scope changes", () => {
  it("retains existing access when a workspace or portfolio is added", () => {
    const before = access();
    const after = access("two");
    after.workspaces.push({ ...after.workspaces[0]!, id: "created" });
    after.portfolios.push({ ...after.portfolios[0]!, id: "created-portfolio" });
    after.session.managedWorkspaceIds.push("created");
    expect(retainsAccessScope(before, after)).toBe(true);
    expect(retainsAccessScope(after, before)).toBe(false);
  });

  it.each([
    ["workspace removal", (next) => (next.workspaces = [])],
    ["portfolio removal", (next) => (next.portfolios = [])],
    ["user change", (next) => (next.session.user.id = "other")],
    ["organization change", (next) => (next.session.organization.id = "other")],
    ["user role change", (next) => (next.session.user.role = "member")],
    [
      "organization role change",
      (next) => (next.session.organization.role = "member"),
    ],
    ["platform role change", (next) => (next.session.platformRole = "owner")],
  ] satisfies Array<[string, (next: LiveAppAccessSnapshot) => unknown]>)(
    "does not retain caches after %s, even when a workspace is also added",
    (_name, change) => {
      const before = access();
      const after = access("two");
      change(after);
      after.workspaces.push({ ...before.workspaces[0]!, id: "created" });
      expect(retainsAccessScope(before, after)).toBe(false);
    },
  );

  it("does not retain caches when managed workspace access shrinks", () => {
    const before = access();
    before.session.managedWorkspaceIds = ["allowed"];
    expect(retainsAccessScope(before, access("two"))).toBe(false);
  });
});

describe("authoritative snapshot revisions", () => {
  it("keeps a certified unchanged snapshot without fetching any records", async () => {
    const read = vi.fn();
    const previous = { ...snapshot(), revision: "one" };
    const result = await readVerifiedSnapshot(
      async () => access(),
      read,
      previous,
    );
    expect(read).not.toHaveBeenCalled();
    expect(result.snapshot.revision).toBe("one");
  });
  it("never publishes records read across a revision change", async () => {
    const readAccess = vi
      .fn()
      .mockResolvedValueOnce(access("one"))
      .mockResolvedValueOnce(access("two"))
      .mockResolvedValueOnce(access("two"));
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        ...snapshot(),
        items: [{ id: "stale", workspaceId: "allowed" }],
      })
      .mockResolvedValueOnce({
        ...snapshot(),
        items: [{ id: "current", workspaceId: "allowed" }],
      });
    const result = await readVerifiedSnapshot(readAccess, read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.snapshot.items.map(({ id }) => id)).toEqual(["current"]);
    expect(result.snapshot.revision).toBe("two");
  });
  it("continues complete refreshes when a server cannot certify a revision", async () => {
    const read = vi.fn(async () => snapshot());
    await readVerifiedSnapshot(async () => access(null), read, {
      ...snapshot(),
      revision: "one",
    });
    expect(read).toHaveBeenCalledOnce();
  });
  it("immediately filters denied workspaces without waiting for a pending record read", () => {
    const source = {
      ...snapshot(),
      items: [
        { id: "retained", workspaceId: "allowed" },
        { id: "revoked", workspaceId: "removed" },
      ],
    } as LiveAppDataSnapshot;
    expect(
      restrictSnapshotToAccess(source, access()).items.map(({ id }) => id),
    ).toEqual(["retained"]);
    expect(source.items).toHaveLength(2);
  });
});

describe("access capability fallback", () => {
  it("remembers unsupported capability only within its reader and preserves current access checks", async () => {
    const current = access();
    const client = {
      syncStatus: vi
        .fn()
        .mockRejectedValue(
          new TrevvApiError("unsupported", "Unsupported", "test", 501),
        ),
      session: vi.fn(async () => current.session),
      portfolios: vi.fn(async () => current.portfolios),
      workspaces: vi.fn(async () => current.workspaces),
      withSignal: vi.fn(() => client),
    };
    const read = createLiveAccessReader(client as unknown as TrevvApiClient, {
      userId: "user",
      organizationId: "org",
    });
    expect((await read()).revision).toBeNull();
    await read();
    expect(client.syncStatus).toHaveBeenCalledOnce();
    expect(client.session).toHaveBeenCalledTimes(2);
  });
  it("does not convert an outage to permission loss or silently switch protocols", async () => {
    const error = new TrevvApiError("unavailable", "Unavailable", "test", 503);
    const client = {
      syncStatus: vi.fn().mockRejectedValue(error),
      session: vi.fn(),
      withSignal: vi.fn(() => client),
    };
    await expect(
      createLiveAccessReader(client as unknown as TrevvApiClient, {
        userId: "user",
        organizationId: "org",
      })(),
    ).rejects.toBe(error);
    expect(client.session).not.toHaveBeenCalled();
  });
  it("rejects a changed identity before any old-identity records can be reused", async () => {
    const changed = access();
    changed.session.user.id = "another-user";
    const client = {
      syncStatus: vi.fn(async () => changed),
      withSignal: vi.fn(() => client),
    };
    await expect(
      createLiveAccessReader(client as unknown as TrevvApiClient, {
        userId: "user",
        organizationId: "org",
      })(),
    ).rejects.toMatchObject({ code: "identity_changed", status: 401 });
  });
});
