import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { WorkItemDto, WorkspaceDto } from "@founderhq/api-contract";
import type { LiveAppDataSnapshot } from "./live-app-data";
import {
  applyConfirmedWorkItem,
  removeConfirmedWorkItem,
} from "./live-app-mutations";
const key = ["live-app-data", "workspace", "w"];
const workspace: WorkspaceDto = {
  id: "w",
  portfolioId: "p",
  name: "Workspace",
  slug: "workspace",
  description: "",
  icon: "W",
  accent: "#5555aa",
  type: "business",
  stage: "idea",
  health: "on_track",
  healthNote: "",
  priority: "",
  metrics: [],
  versionTag: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
const item = (version: number): WorkItemDto => ({
  id: "item",
  workspaceId: "w",
  boardId: "board",
  title: `Version ${version}`,
  description: "",
  type: "task",
  priority: "normal",
  status: "working",
  assignees: [],
  version,
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
});
const snapshot = (version: number): LiveAppDataSnapshot => ({
  portfolios: [],
  workspaces: [workspace],
  items: [item(version)],
  attention: [],
  waiting: [],
  complete: true,
  refreshedAt: "2026-09-05T00:00:00.000Z",
});

describe("confirmed mutation ordering", () => {
  it.each(["update", "delete"] as const)(
    "an obsolete in-flight snapshot cannot undo a confirmed %s",
    async (kind) => {
      const client = new QueryClient();
      client.setQueryData(key, snapshot(1));
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const pending = client
        .fetchQuery({
          queryKey: key,
          staleTime: 0,
          queryFn: async () => {
            await held;
            return snapshot(1);
          },
        })
        .catch(() => undefined);
      if (kind === "update") await applyConfirmedWorkItem(client, item(2));
      else await removeConfirmedWorkItem(client, "w", "item");
      release();
      await pending;
      await Promise.resolve();
      expect(client.getQueryData<LiveAppDataSnapshot>(key)?.items).toEqual(
        kind === "update" ? [item(2)] : [],
      );
      client.clear();
    },
  );
  it("never replaces a newer confirmed version or writes into another workspace cache", async () => {
    const client = new QueryClient();
    client.setQueryData(key, snapshot(3));
    const otherKey = ["live-app-data", "workspace", "other"];
    client.setQueryData(otherKey, { ...snapshot(1), items: [] });
    await applyConfirmedWorkItem(client, item(2));
    expect(client.getQueryData<LiveAppDataSnapshot>(key)?.items).toEqual([
      item(3),
    ]);
    expect(client.getQueryData<LiveAppDataSnapshot>(otherKey)?.items).toEqual(
      [],
    );
    client.clear();
  });
});
