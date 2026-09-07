import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, resolve } from "node:path";

let directory = "";
const assets = new Map<string, Buffer>();
test.beforeAll(async () => {
  const require = createRequire(resolve("apps/web/package.json"));
  const { build } = await import(require.resolve("vite"));
  directory = await mkdtemp(resolve(tmpdir(), "trevv-creation-modules-"));
  await build({
    configFile: false,
    root: resolve("apps/web"),
    logLevel: "error",
    resolve: { alias: { "@": resolve("apps/web") } },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: directory,
      minify: true,
      lib: {
        entry: resolve("apps/web/test-fixtures/creation-modules.tsx"),
        formats: ["es"],
        fileName: () => "harness.js",
      },
    },
  });
  for (const file of await readdir(directory))
    assets.set(`/${file}`, await readFile(resolve(directory, file)));
});
test.afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("creation modules are lazy, closable while loading, and preserve captured work and retry inputs", async ({
  page,
}) => {
  const requested: string[] = [];
  let releaseCapture = () => {};
  const captureDelay = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  await page.route("https://trevv.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    requested.push(pathname);
    if (pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div><script type="module" src="/harness.js"></script>',
      });
    if (pathname.includes("universal-create-")) await captureDelay;
    const body = assets.get(pathname);
    return body
      ? route.fulfill({
          contentType:
            extname(pathname) === ".css" ? "text/css" : "text/javascript",
          body,
        })
      : route.abort();
  });
  await page.goto("https://trevv.test/");
  await expect(
    page.getByRole("button", { name: "Open capture", exact: true }),
  ).toBeVisible();
  expect(
    requested.some((path) =>
      /universal-create-|create-workspace-dialog-|portfolio-create-dialog-/.test(
        path,
      ),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Open capture", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText(
    "Loading creation form…",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  releaseCapture();
  await page.getByRole("button", { name: "Open capture", exact: true }).click();
  const capture = page.getByRole("dialog", { name: "Create in TREVV" });
  await capture
    .getByLabel("Task title", { exact: true })
    .fill("Preserved capture");
  await capture.getByRole("button", { name: /^Create Task$/i }).click();
  await expect(page.locator("#saved")).toHaveText("Preserved capture");

  await page.getByRole("button", { name: "Open workspace creation" }).click();
  const workspace = page.getByRole("dialog", { name: "Create a workspace" });
  await workspace.getByLabel("Workspace name").fill("Retained workspace");
  await workspace
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(workspace).toContainText(
    "The server did not confirm this workspace.",
  );
  await expect(workspace.getByLabel("Workspace name")).toHaveValue(
    "Retained workspace",
  );
  await workspace
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page.locator("#saved")).toContainText(
    '"name":"Retained workspace"',
  );

  await page.getByRole("button", { name: "Open portfolio creation" }).click();
  const portfolio = page.getByRole("dialog", { name: "Create a portfolio" });
  await portfolio.getByLabel("Portfolio name").fill("Preserved portfolio");
  await portfolio.getByLabel("Logo mark").fill("PP");
  await portfolio
    .getByLabel("Purpose")
    .fill("Same creation behavior in a lazy module");
  await portfolio
    .getByRole("button", { name: "Create portfolio", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((value) =>
        value.includes("Preserved portfolio"),
      ),
    ),
  ).toBe(true);
});
