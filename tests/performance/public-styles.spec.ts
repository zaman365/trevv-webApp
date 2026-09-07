import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

let directory = "";
let script = "";
let commonCss = "";
let completeCss = "";
let publicCss = "";
test.beforeAll(async () => {
  const require = createRequire(resolve("apps/web/package.json"));
  const { build } = await import(require.resolve("vite"));
  directory = await mkdtemp(resolve(tmpdir(), "trevv-public-styles-"));
  await build({
    configFile: false,
    root: resolve("apps/web"),
    logLevel: "error",
    resolve: { alias: { "@": resolve("apps/web") } },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env": "{}",
    },
    build: {
      outDir: directory,
      minify: false,
      lib: {
        entry: resolve("apps/web/test-fixtures/public-styles.tsx"),
        formats: ["iife"],
        name: "PublicStyles",
        fileName: () => "harness.js",
      },
    },
  });
  script = await readFile(resolve(directory, "harness.js"), "utf8");
  const moduleCss = (
    await Promise.all(
      (await readdir(directory))
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFile(resolve(directory, name), "utf8")),
    )
  ).join("\n");
  commonCss =
    (await readFile(resolve("apps/web/app/globals.css"), "utf8")).replace(
      '@import "tailwindcss";',
      "",
    ) + moduleCss;
  const tokens = await readFile(
    require.resolve("@founderhq/design-tokens/css"),
    "utf8",
  );
  commonCss = tokens + commonCss;
  completeCss = (
    await Promise.all(
      ["workspace.css", "design-system.css"].map((name) =>
        readFile(resolve("apps/web/app", name), "utf8"),
      ),
    )
  ).join("\n");
  publicCss = await readFile(
    resolve("apps/web/app/public-product.css"),
    "utf8",
  );
});
test.afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const width of [390, 1440])
  for (const theme of ["light", "dark"]) {
    test(`public product CSS preserves computed styles at ${width}px in ${theme}`, async ({
      page,
    }) => {
      page.on("pageerror", (error) =>
        console.error("Public fixture error:", error.message),
      );
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({
        reducedMotion: "reduce",
        colorScheme: theme as "light" | "dark",
      });
      await page.route("http://trevv.test/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        return path === "/api/v1/session/organizations"
          ? route.fulfill({
              json: {
                organizations: [
                  {
                    id: "org-one",
                    slug: "fixture",
                    name: "Fixture organization",
                    role: "owner",
                  },
                ],
              },
            })
          : path.startsWith("/api/")
            ? route.fulfill({ status: 200, json: {} })
            : route.fulfill({
                contentType: "text/html",
                body: `<html data-theme="${theme}"><body><div id="root"></div></body></html>`,
              });
      });
      for (const surface of [
        "sign-in",
        "sign-up",
        "forgot",
        "reset",
        "verify",
        "organizations",
        "invite",
        "onboarding",
      ]) {
        await page.goto(`http://trevv.test/?page=${surface}`);
        await page.addStyleTag({
          content:
            commonCss +
            "\n* { animation: none !important; transition: none !important; }",
        });
        const style = await page.addStyleTag({ content: completeCss });
        await page.addScriptTag({ content: script });
        await expect(page.locator("main")).toBeVisible();
        const snapshot = () =>
          page.locator("main").evaluate((main) =>
            [main, ...main.querySelectorAll("*")].map((element) => {
              const computed = getComputedStyle(element);
              return {
                tag: element.tagName,
                classes: element.getAttribute("class"),
                style: Object.fromEntries(
                  Array.from(computed)
                    .filter((key) => !key.startsWith("--"))
                    .map((key) => [key, computed.getPropertyValue(key)]),
                ),
              };
            }),
          );
        const before = await snapshot();
        await style.evaluate((element, value) => {
          element.textContent = value;
        }, publicCss);
        expect(await snapshot(), surface).toEqual(before);
        // Exercise subsequent onboarding surfaces, retaining the exact cascade.
        if (surface === "onboarding") {
          for (let step = 0; step < 3; step++) {
            const next = page
              .getByRole("button", { name: /Continue|Next|Finish setup/ })
              .first();
            if (!(await next.isVisible()) || !(await next.isEnabled())) break;
            await next.click();
            await page.mouse.move(0, 0);
            await page.evaluate(
              () =>
                new Promise<void>((resolve) =>
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve()),
                  ),
                ),
            );
            await style.evaluate((element, value) => {
              element.textContent = value;
            }, completeCss);
            const original = await snapshot();
            await style.evaluate((element, value) => {
              element.textContent = value;
            }, publicCss);
            expect(await snapshot(), `onboarding step ${step}`).toEqual(
              original,
            );
          }
        }
      }
    });
  }
