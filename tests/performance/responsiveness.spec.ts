import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

let script = "";
let outputDirectory = "";
test.beforeAll(async () => {
  const webRequire = createRequire(resolve("apps/web/package.json"));
  const { build } = await import(webRequire.resolve("vite"));
  outputDirectory = await mkdtemp(resolve(tmpdir(), "trevv-responsiveness-"));
  await build({
    configFile: false,
    root: resolve("apps/web"),
    logLevel: "error",
    resolve: { alias: { "@": resolve("apps/web") } },
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    build: {
      outDir: outputDirectory,
      minify: false,
      lib: {
        entry: resolve("apps/web/test-fixtures/responsiveness.tsx"),
        formats: ["iife"],
        name: "Responsiveness",
        fileName: () => "harness.js",
      },
    },
  });
  script = await readFile(resolve(outputDirectory, "harness.js"), "utf8");
});
test.afterAll(async () => {
  if (outputDirectory)
    await rm(outputDirectory, { recursive: true, force: true });
});

test("unchanged polls preserve renders and drafts while updates and access loss still propagate", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-05T10:00:00Z") });
  let name = "Original";
  let status = 200;
  let polls = 0;
  await page.route("http://trevv.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (url.pathname === "/api/v1/portfolios") polls++;
    const body =
      status !== 200
        ? {
            error: {
              code: status === 403 ? "forbidden" : "unavailable",
              message: "Test response",
            },
          }
        : url.pathname === "/api/v1/portfolios"
          ? [
              {
                id: "portfolio-one",
                organizationId: "org-one",
                name,
                slug: "original",
                description: "",
                isDefault: true,
              },
            ]
          : url.pathname === "/api/v1/items"
            ? { data: [], nextCursor: null }
            : [];
    await route.fulfill({ status, json: body });
  });
  await page.goto("http://trevv.test/");
  await page.addScriptTag({ content: script });
  await expect(page.locator("#records")).toHaveText("Original");
  await page.getByRole("textbox", { name: "Draft" }).fill("Keep this draft");
  const initial = await page.evaluate(() => ({
    ...(window as unknown as { performanceCommits: Record<string, number> })
      .performanceCommits,
  }));
  const initialClock = await page.locator("#clock").textContent();
  for (let index = 0; index < 3; index++) {
    await page.clock.fastForward(5_000);
    await expect.poll(() => polls).toBe(index + 1);
    await expect(page.locator("#clock")).not.toHaveText(initialClock!);
    // Flush query observer notifications before comparing render counts.
    await page.clock.runFor(50);
  }
  const unchanged = await page.evaluate(() => ({
    ...(window as unknown as { performanceCommits: Record<string, number> })
      .performanceCommits,
  }));
  expect(unchanged.records).toBe(initial.records);
  expect(unchanged.workspace).toBe(initial.workspace);
  await expect(page.getByRole("textbox")).toHaveValue("Keep this draft");
  name = "Changed";
  await page.clock.fastForward(5_000);
  await expect(page.locator("#records")).toHaveText("Changed");
  status = 403;
  await page.clock.fastForward(5_000);
  await expect(page.locator("#access")).toHaveText("lost");
  await expect(page.locator("#records")).toHaveText("");
  status = 200;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("#records")).toHaveText("Changed");
  await expect(page.locator("#stale")).toHaveText("false");
  console.log(
    JSON.stringify({
      unchangedPolls: 3,
      recordCommits: unchanged.records! - initial.records!,
      workspaceCommits: unchanged.workspace! - initial.workspace!,
    }),
  );
});

test("unrelated storage events do not repaint workspace data and blocked storage preserves local creation", async ({
  page,
}) => {
  await page.route("http://trevv.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://trevv.test/");
  await page.addScriptTag({ content: script });
  await expect(
    page.getByRole("button", { name: "Create local workspace" }),
  ).toBeVisible();
  const before = await page.evaluate(
    () =>
      (window as unknown as { performanceCommits: { storage: number } })
        .performanceCommits.storage,
  );
  await page.evaluate(() => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "unrelated-draft",
        storageArea: localStorage,
        newValue: "updated",
      }),
    );
  });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { performanceCommits: { storage: number } })
          .performanceCommits.storage,
    ),
  ).toBe(before);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Create local workspace" }).click();
  await expect(page.locator("#storage")).toHaveText("Local draft");
});

test("switching conversations never presents the old room under the new selection", async ({
  page,
}) => {
  let releaseSecond: () => void = () => {};
  const secondReady = new Promise<void>((resolveReady) => {
    releaseSecond = resolveReady;
  });
  await page.route("http://trevv.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (path.endsWith("room-two")) await secondReady;
    const id = path.endsWith("room-two") ? "room-two" : "room-one";
    await route.fulfill({
      json: {
        id,
        organizationId: "org-one",
        portfolioId: "portfolio-one",
        workspaceId: "workspace-one",
        title: id,
        purpose: "",
        kind: "workspace",
        visibility: "organization",
        participants: [],
        unreadCount: 0,
        needsResponseCount: 0,
        retentionDays: 365,
        version: 1,
        createdAt: "2026-09-05T10:00:00Z",
        updatedAt: "2026-09-05T10:00:00Z",
      },
    });
  });
  await page.goto("http://trevv.test/#conversation");
  await page.addScriptTag({ content: script });
  await expect(page.locator("#conversation")).toHaveText("room-one");
  await page.getByLabel("Conversation").selectOption("room-two");
  await expect(page.locator("#conversation")).toHaveText("Loading");
  releaseSecond();
  await expect(page.locator("#conversation")).toHaveText("room-two");
  await page.getByLabel("Conversation").selectOption("room-one");
  await expect(page.locator("#conversation")).toHaveText("room-one");
});
