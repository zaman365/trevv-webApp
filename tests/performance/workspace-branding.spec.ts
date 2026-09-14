import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { snapshot } from "../../apps/web/test-fixtures/live-workflow-data";
import { setup } from "../fixtures/live-workflow-browser";
import { teamWorkspaceApi } from "../fixtures/team-workspace-api";

const require = createRequire(resolve("apps/api/package.json"));
const sharp =
  require("sharp") as typeof import("../../apps/api/node_modules/sharp");

test("workspace logo upload, replacement, undo and removal preserve settings and survive reload", async ({
  page,
}) => {
  const workspaces = structuredClone(snapshot.workspaces);
  let pixels: Buffer | undefined;
  let writes = 0;
  const workspace = workspaces[0]!;
  await setup(page, "", {
    view: "page-settings",
    workspaces,
    api: async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === `/api/v1/workspaces/${workspace.id}/logo`) {
        await route.fulfill({ contentType: "image/webp", body: pixels! });
        return true;
      }
      if (path !== `/api/v1/workspaces/${workspace.id}/settings`) return false;
      expect(route.request().headers()["if-match"]).toBe(
        `"${workspace.versionTag}"`,
      );
      const { logo, ...fields } = route.request().postDataJSON();
      if (typeof logo === "string") {
        expect(logo).toMatch(/^data:image\/webp;base64,/);
        pixels = Buffer.from(logo.split(",")[1], "base64");
        const metadata = await sharp(pixels).metadata();
        expect(metadata.width).toBeLessThanOrEqual(512);
        expect(metadata.height).toBeLessThanOrEqual(512);
        workspace.logoUrl = `/api/v1/workspaces/${workspace.id}/logo?v=${String(writes + 1).repeat(64)}`;
      } else if (logo === null) {
        delete workspace.logoUrl;
        pixels = undefined;
      }
      Object.assign(workspace, fields, {
        versionTag: new Date(
          Date.parse(workspace.versionTag) + 1,
        ).toISOString(),
      });
      writes++;
      await route.fulfill({
        json: workspace,
        headers: {
          "x-trevv-resource-version": workspace.versionTag,
          etag: 'W/"proxy-content-hash"',
        },
      });
      return true;
    },
  });
  const field = page.getByRole("region", {
    name: "Workspace logo",
    exact: true,
  });
  const upload = page.getByLabel("Choose workspace logo");
  const save = page.getByRole("button", {
    name: "Save Workspace settings",
    exact: true,
  });
  await upload.setInputFiles({
    name: "invalid.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(field.getByRole("alert")).toContainText("Choose a PNG");
  expect(writes).toBe(0);
  const source = await sharp({
    create: { width: 800, height: 400, channels: 4, background: "#635bff" },
  })
    .png()
    .toBuffer();
  await upload.setInputFiles({
    name: "brand.png",
    mimeType: "image/png",
    buffer: source,
  });
  await expect(field.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/webp/,
  );
  await page.getByLabel("Name", { exact: true }).fill("Branded Launch");
  await save.click();
  await expect(
    page.getByText("Server confirmed “Branded Launch”", { exact: true }),
  ).toBeVisible();
  expect(workspace.name).toBe("Branded Launch");
  expect(workspace.icon).toBe("L");
  const firstUrl = workspace.logoUrl!;
  await page.reload();
  await page
    .getByRole("button", { name: "Refresh connection", exact: true })
    .click();
  await expect(field.locator("img")).toHaveAttribute("src", firstUrl);
  await expect(field.locator("img")).toBeVisible();
  const replacement = await sharp({
    create: { width: 300, height: 300, channels: 3, background: "#22aa88" },
  })
    .jpeg()
    .toBuffer();
  await upload.setInputFiles({
    name: "brand.jpg",
    mimeType: "image/jpeg",
    buffer: replacement,
  });
  await expect(
    field.getByRole("button", { name: "Undo logo change" }),
  ).toBeVisible();
  await save.click();
  await expect(field.locator("img")).not.toHaveAttribute("src", firstUrl);
  await expect(
    page.getByText("Server confirmed “Branded Launch”", { exact: true }),
  ).toBeVisible();
  await field.getByRole("button", { name: "Remove logo" }).click();
  await expect(field.locator("img")).toHaveCount(0);
  await field.getByRole("button", { name: "Undo logo change" }).click();
  await expect(field.locator("img")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await field.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/private/tmp/trevv-logo-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await field.getByRole("button", { name: "Remove logo" }).click();
  await save.click();
  await expect(
    page.getByText("Server confirmed “Branded Launch”", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    field.getByRole("button", { name: "Upload logo" }),
  ).toBeVisible();
  await expect(field.locator("img")).toHaveCount(0);
  expect(writes).toBe(3);
  expect(workspace.icon).toBe("L");
});

test("team renames accept logical receipts and legacy weak ETags without false conflicts", async ({
  page,
}) => {
  const fixture = teamWorkspaceApi();
  let writes = 0;
  await setup(page, "", {
    view: "team",
    teamId: "team-launch",
    teams: fixture.state.teams,
    api: async (route) => {
      if (
        new URL(route.request().url()).pathname ===
          "/api/v1/teams/team-launch" &&
        route.request().method() === "PATCH"
      ) {
        const team = fixture.state.teams[0]!;
        expect(route.request().headers()["if-match"]).toBe(`"${team.version}"`);
        Object.assign(team, route.request().postDataJSON(), {
          version: team.version + 1,
        });
        writes++;
        await route.fulfill({
          json: team,
          headers:
            writes === 1
              ? {
                  "x-trevv-resource-version": String(team.version),
                  etag: 'W/"compressed-by-proxy"',
                }
              : { etag: `W/"${team.version}"` },
        });
        return true;
      }
      return fixture.api(route);
    },
  });
  await page
    .getByRole("navigation", { name: "Team page sections" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  const name = page.getByLabel("Name", { exact: true });
  const save = page.getByRole("button", {
    name: "Save Team profile",
    exact: true,
  });
  for (const value of ["Content System", "Creative Team"]) {
    await name.fill(value);
    await save.click();
    await expect(
      page.getByText("Team settings were saved.", { exact: true }),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(
      page.getByText("The save confirmation could not be read", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText("This team changed while you were editing", {
        exact: true,
      }),
    ).toHaveCount(0);
  }
  expect(writes).toBe(2);
});
