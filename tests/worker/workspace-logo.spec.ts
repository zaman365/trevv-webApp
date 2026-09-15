import { expect, test } from "@playwright/test";

test("compiled production workspace accepts a logo and preserves it after reload", async ({
  page,
  context,
  request,
}) => {
  await request.get("http://127.0.0.1:3219/test/reset");
  await context.addCookies([
    {
      name: "trevv_alpha.session_token",
      value: "local-fixture-only",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/app/workspaces/navigation-test/settings");
  const field = page.getByRole("region", {
    name: "Workspace logo",
    exact: true,
  });
  await page.getByLabel("Choose workspace logo").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(field.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  await page
    .getByRole("button", { name: "Save Workspace settings", exact: true })
    .click();
  await expect(
    page.getByText("Server confirmed “Navigation test”", { exact: true }),
  ).toBeVisible();
  const savedUrl = await field.locator("img").getAttribute("src");
  expect(savedUrl).toMatch(/^\/api\/v1\/workspaces\/workspace-one\/logo\?v=/);
  await page.reload();
  await expect(field.locator("img")).toHaveAttribute("src", savedUrl!);
  await expect(page.getByRole("complementary").locator("img")).toHaveAttribute(
    "src",
    savedUrl!,
  );
  await field.getByRole("button", { name: "Remove logo", exact: true }).click();
  await page
    .getByRole("button", { name: "Save Workspace settings", exact: true })
    .click();
  await expect(
    page.getByText("Server confirmed “Navigation test”", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    field.getByRole("button", { name: "Upload logo", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Icon or short mark")).toHaveValue("N");
});
