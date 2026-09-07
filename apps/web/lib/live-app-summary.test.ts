import { describe, expect, it, vi } from "vitest";
import { TrevvApiError, type TrevvApiClient } from "@founderhq/api-client";
import {
  summarizeAppSnapshot,
  restrictSummaryToAccess,
  createLiveSummaryReader,
} from "./live-app-summary";
import { fetchLiveAppData, type LiveAppDataSnapshot } from "./live-app-data";
import { type LiveAppAccessSnapshot } from "./live-app-sync";
const snapshot = {
  portfolios: [{ id: "p" }],
  workspaces: [{ id: "w" }],
  items: [],
  attention: [],
  waiting: [],
  refreshedAt: "2026-09-05T00:00:00.000Z",
} as unknown as LiveAppDataSnapshot;
const access = (revision: string | null = "one") =>
  ({
    ...snapshot,
    revision,
    protocol: 1,
    checkedAt: snapshot.refreshedAt,
  }) as unknown as LiveAppAccessSnapshot;

describe("complete authorized summary", () => {
  it("counts empty workspaces, open work, undecided decisions, and distinct active attention entities", () => {
    const summary = summarizeAppSnapshot({
      ...snapshot,
      items: [
        { workspaceId: "w", status: "blocked", type: "task" },
        {
          workspaceId: "w",
          status: "working",
          type: "decision",
          decisionState: "needed",
        },
        {
          workspaceId: "w",
          status: "working",
          type: "decision",
          decisionState: "decided",
        },
        {
          workspaceId: "w",
          status: "done",
          type: "decision",
          decisionState: "needed",
        },
      ],
      attention: [
        { portfolioId: "p", workspaceId: "w", entityId: "a" },
        { portfolioId: "p", workspaceId: "w", entityId: "a" },
        { portfolioId: "p", entityId: "b" },
        {
          portfolioId: "p",
          workspaceId: "w",
          entityId: "c",
          snoozedUntil: "2026-09-06T00:00:00.000Z",
        },
        {
          portfolioId: "p",
          workspaceId: "w",
          entityId: "d",
          dismissedAt: snapshot.refreshedAt,
        },
      ],
    } as unknown as LiveAppDataSnapshot);
    expect(summary.workspaces).toEqual([
      {
        workspaceId: "w",
        open: 3,
        blocked: 1,
        pendingDecisions: 1,
        attention: 2,
        attentionEntities: 1,
      },
    ]);
    expect(summary.portfolios).toEqual([
      { portfolioId: "p", attention: 3, attentionEntities: 2 },
    ]);
    expect(restrictSummaryToAccess(summary, access())).toBe(summary);
    expect(
      restrictSummaryToAccess(summary, { ...access(), workspaces: [] })
        .workspaces,
    ).toEqual([]);
  });
  it("uses complete fallback only for explicit unsupported capability and remembers it per reader", async () => {
    const client = {
      syncSummary: vi
        .fn()
        .mockRejectedValue(
          new TrevvApiError("unsupported", "Unsupported", "test", 501),
        ),
      withSignal: vi.fn(() => client),
    };
    const read = createLiveSummaryReader(client as unknown as TrevvApiClient);
    const legacy = vi.fn(async () => snapshot);
    await read(new AbortController().signal, async () => access(null), legacy);
    await read(new AbortController().signal, async () => access(null), legacy);
    expect(client.syncSummary).toHaveBeenCalledOnce();
    expect(legacy).toHaveBeenCalledTimes(2);
  });
  it("does not reread aggregates for a certified unchanged revision", async () => {
    const client = { syncSummary: vi.fn() };
    const before = { ...summarizeAppSnapshot(snapshot), revision: "one" };
    const result = await createLiveSummaryReader(
      client as unknown as TrevvApiClient,
    )(new AbortController().signal, async () => access(), vi.fn(), before);
    expect(result).toBe(before);
    expect(client.syncSummary).not.toHaveBeenCalled();
  });
  it("never certifies an aggregate read across a revision change", async () => {
    const client = {
      syncSummary: vi
        .fn()
        .mockResolvedValueOnce({
          ...summarizeAppSnapshot(snapshot),
          revision: "one",
        })
        .mockResolvedValueOnce({
          ...summarizeAppSnapshot(snapshot),
          revision: "two",
        }),
      withSignal: vi.fn(() => client),
    };
    const scopes = vi
      .fn()
      .mockResolvedValueOnce(access("one"))
      .mockResolvedValue(access("two"));
    const result = await createLiveSummaryReader(
      client as unknown as TrevvApiClient,
    )(new AbortController().signal, scopes, vi.fn());
    expect(client.syncSummary).toHaveBeenCalledTimes(2);
    expect(result.revision).toBe("two");
  });
});

describe("progressive scoped records", () => {
  it("exposes a usable first page, preserves scope on every request, and certifies only complete data", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = {
      attention: vi.fn(async () => []),
      waiting: vi.fn(async () => []),
      items: vi.fn(
        async ({ cursor }: { cursor?: string; workspaceId?: string }) => {
          if (cursor) await held;
          return {
            data: [{ id: cursor ? "last" : "first", workspaceId: "w" }],
            nextCursor: cursor ? null : "next",
          };
        },
      ),
    };
    const progress = vi.fn();
    const result = fetchLiveAppData(
      client as unknown as TrevvApiClient,
      snapshot,
      "w",
      progress,
    );
    await vi.waitFor(() => expect(progress).toHaveBeenCalledOnce());
    expect(progress.mock.calls[0]?.[0]).toMatchObject({
      complete: false,
      items: [{ id: "first", workspaceId: "w" }],
    });
    expect(progress.mock.calls[0]?.[0].revision).toBeUndefined();
    release();
    expect(await result).toMatchObject({
      complete: true,
      items: [{ id: "first" }, { id: "last" }],
    });
    expect(
      client.items.mock.calls.every(([filters]) => filters.workspaceId === "w"),
    ).toBe(true);
    expect(client.attention).toHaveBeenCalledWith({ workspaceId: "w" });
    expect(client.waiting).toHaveBeenCalledWith({ workspaceId: "w" });
  });
});
