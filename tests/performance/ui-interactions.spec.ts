import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
let script = "";
let css = "";
let directory = "";
test.beforeAll(async () => {
  const require = createRequire(resolve("apps/web/package.json"));
  const { build } = await import(require.resolve("vite"));
  directory = await mkdtemp(resolve(tmpdir(), "trevv-ui-interactions-"));
  await build({
    configFile: false,
    root: resolve("apps/web"),
    logLevel: "error",
    resolve: { alias: { "@": resolve("apps/web") } },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: directory,
      minify: false,
      lib: {
        entry: resolve("apps/web/test-fixtures/ui-interactions.tsx"),
        formats: ["iife"],
        name: "UiInteractions",
        fileName: () => "harness.js",
      },
    },
  });
  script = await readFile(resolve(directory, "harness.js"), "utf8");
  css = (
    await Promise.all(
      (await readdir(directory))
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFile(resolve(directory, name), "utf8")),
    )
  ).join("\n");
});
test.afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("10k records retain full scroll access and keyboard focus with bounded mounted rows", async ({
  page,
}) => {
  await page.route("http://trevv.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://trevv.test/");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  const list = page.getByRole("list", { name: "Work records" });
  await expect(
    page.getByRole("button", { name: "Item 0", exact: true }),
  ).toBeVisible();
  expect(await list.locator("[data-collection-index]").count()).toBeLessThan(
    50,
  );
  await page.getByLabel("Edit Item 0", { exact: true }).focus();
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(() => list.locator('[data-collection-index="5000"]').count())
    .toBe(1);
  await expect(page.getByLabel("Edit Item 0", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Item 1", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "After collection" }).focus();
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(
    page.getByRole("button", { name: "Item 9999", exact: true }),
  ).toBeVisible();
  expect(await list.locator("[data-collection-index]").count()).toBeLessThan(
    50,
  );
});

test("composer typing leaves unchanged rows alone and flushes latest text before send", async ({
  page,
}) => {
  await page.route("http://trevv.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://trevv.test/");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("A");
  // Let the viewport settle independently of the typing operation under test.
  await expect(
    page.getByRole("button", { name: "Item 0", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(100);
  const before = await page.evaluate(
    () =>
      (window as unknown as { uiInteractionCommits: { rows: number } })
        .uiInteractionCommits.rows,
  );
  await input.pressSequentially(" complete recoverable draft", { delay: 10 });
  const after = await page.evaluate(
    () =>
      (window as unknown as { uiInteractionCommits: { rows: number } })
        .uiInteractionCommits.rows,
  );
  expect(after).toBe(before);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("#sent")).toHaveText(
    "A complete recoverable draft",
  );
  expect(await page.evaluate(() => localStorage.getItem("fixture-draft"))).toBe(
    "A complete recoverable draft",
  );
});

test("late item A history never appears under item B, even when transport ignores cancellation", async ({
  page,
}) => {
  let releaseA: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  await page.route("http://trevv.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (path.includes("item-a")) await delayed;
    const item = path.includes("item-a") ? "item-a" : "item-b";
    return route.fulfill({
      json: path.endsWith("/history")
        ? [
            {
              id: `history-${item}`,
              type: "created",
              reasonCode: "created",
              summary: `History ${item}`,
              occurredAt: "2026-09-05T10:00:00Z",
              metadata: {},
            },
          ]
        : [],
    });
  });
  await page.goto("http://trevv.test/#details");
  await page.addScriptTag({ content: script });
  await page.getByRole("button", { name: "Item B", exact: true }).click();
  await expect(page.locator("#selected")).toHaveText("item-b");
  await expect(page.locator("#history")).toHaveText("History item-b");
  releaseA();
  await page.waitForTimeout(50);
  await expect(page.locator("#history")).toHaveText("History item-b");
  await page.getByRole("button", { name: "Item A", exact: true }).click();
  await expect(page.locator("#history")).toHaveText("History item-a");
});

test("nested virtual replies retain their parent and keyboard focus without confusing list indexes", async ({
  page,
}) => {
  await page.route("http://trevv.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://trevv.test/#nested");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  const outer = page.getByRole("list", { name: "Outer timeline", exact: true });
  const replies = page.getByRole("list", {
    name: "Nested replies",
    exact: true,
  });
  await page.getByLabel("Edit Reply 0", { exact: true }).focus();
  await replies.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
    element.dispatchEvent(new Event("scroll"));
  });
  await outer.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(50);
  await expect(page.getByLabel("Edit Reply 0", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Reply 1", exact: true }),
  ).toBeFocused();
});

test("loading earlier messages preserves identity and screen offset across the windowing threshold", async ({
  page,
}) => {
  await page.route("http://trevv.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://trevv.test/#history");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  const scroller = page.getByRole("region", { name: "History scroll" });
  await scroller.evaluate((element) => {
    element.scrollTop = 900;
    element.dispatchEvent(new Event("scroll"));
  });
  const anchor = await scroller.evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    const row = [
      ...element.querySelectorAll<HTMLElement>("[data-message-id]"),
    ].find((row) => row.getBoundingClientRect().bottom > top)!;
    return {
      id: row.dataset.messageId!,
      offset: row.getBoundingClientRect().top - top,
    };
  });
  await page.getByRole("button", { name: "Load earlier history" }).click();
  const target = scroller.locator(`[data-message-id="${anchor.id}"]`);
  await expect(target).toHaveCount(1);
  await expect
    .poll(async () =>
      target.evaluate(
        (element) =>
          element.getBoundingClientRect().top -
          element.closest('[role="region"]')!.getBoundingClientRect().top,
      ),
    )
    .toBeCloseTo(anchor.offset, 0);
  expect(
    await scroller.locator("[data-collection-index]").count(),
  ).toBeLessThan(50);
  await page.getByRole("button", { name: "Load earlier history" }).click();
  await expect
    .poll(async () =>
      target.evaluate(
        (element) =>
          element.getBoundingClientRect().top -
          element.closest('[role="region"]')!.getBoundingClientRect().top,
      ),
    )
    .toBeCloseTo(anchor.offset, 0);
});

test("background list growth preserves focused controls across the windowing threshold", async ({
  page,
}) => {
  await page.route("http://trevv.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://trevv.test/#history");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  const focused = page.getByRole("button", { name: "Message 8", exact: true });
  await focused.focus();
  // Simulate an arriving page without moving keyboard focus to the load control.
  await page
    .getByRole("button", { name: "Load earlier history" })
    .evaluate((button: HTMLElement) => button.click());
  await expect(focused).toBeFocused();
});
