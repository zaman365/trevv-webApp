import { describe, expect, it } from "vitest";
import { createDemoAdapter } from "./demo-adapter";
import type { ApiRequestContext } from "./data-plane";

describe("scoped demo Waiting", () => {
  it.each(["owner", "member", "guest", "viewer"] as const)(
    "preserves existing visible Waiting when scoped for %s",
    async (role) => {
      const { accessResolver, dataPlane } = createDemoAdapter();
      const resolved = await accessResolver.resolve(
        new Request("http://local.test"),
      );
      const context: ApiRequestContext = {
        access: { ...resolved!.access, role },
        requestId: "demo-waiting-scope",
        now: new Date("2026-08-24T12:00:00.000Z"),
        newId: () => "unused",
      };
      const all = await dataPlane.listWaiting(context);
      expect(all.length).toBeGreaterThan(0);
      const workspaceId = all[0]!.workspaceId;
      expect(await dataPlane.listWaiting(context, { workspaceId })).toEqual(
        all.filter((waiting) => waiting.workspaceId === workspaceId),
      );
      if (role !== "owner") {
        context.access.accessibleWorkspaceIds = new Set();
        await expect(
          dataPlane.listWaiting(context, { workspaceId }),
        ).rejects.toThrow();
      }
    },
  );
});
