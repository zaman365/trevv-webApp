import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoReportPlanClient } from "./report-plan-demo";
import { newReportPlan } from "./report-plan";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("isolated demo reports", () => {
  it("survives reloads without crossing users, organizations or workspaces", async () => {
    const user = { id: "demo-user", name: "Demo member" };
    const client = createDemoReportPlanClient("org-a", user);
    const input = newReportPlan("report", "2026-09-10");
    const created = await client.create("workspace-a", input, "create-once");
    expect(await client.create("workspace-a", input, "create-once")).toEqual(
      created,
    );
    const reloaded = createDemoReportPlanClient("org-a", user);
    expect((await reloaded.list("workspace-a", { page: 1 })).data).toEqual([
      created,
    ]);
    expect((await reloaded.list("workspace-b", { page: 1 })).data).toEqual([]);
    expect(
      (
        await createDemoReportPlanClient("org-b", user).list("workspace-a", {
          page: 1,
        })
      ).data,
    ).toEqual([]);
    expect(
      (
        await createDemoReportPlanClient("org-a", {
          id: "other",
          name: "Other",
        }).list("workspace-a", { page: 1 })
      ).data,
    ).toEqual([]);
    await client.archive(created.id, created.version, "archive-once");
    expect((await reloaded.list("workspace-a", { page: 1 })).data).toEqual([]);
  });
  it("does not report a successful save when browser storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    });
    const client = createDemoReportPlanClient("org", {
      id: "member",
      name: "Member",
    });
    await expect(
      client.create(
        "workspace",
        newReportPlan("report", "2026-09-10"),
        "failed-save",
      ),
    ).rejects.toThrow("Storage unavailable");
  });
});
