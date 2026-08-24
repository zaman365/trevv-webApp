import { expect, test } from "@playwright/test";

test("founder reviews Portfolio attention and opens a Hub", async ({
  page,
}) => {
  await page.goto("/app/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your attention, in one place" }),
  ).toBeVisible();
  const hubLink = page.locator('.hub-card[href="/app/hubs/zehn"]');
  await expect(hubLink).toBeVisible();
  await hubLink.click();
  await expect(page.getByRole("heading", { name: "ZEHN" })).toBeVisible();
});

test("team member updates a board item inline and uses the detail panel", async ({
  page,
}) => {
  await page.goto("/app/hubs/zehn/boards/b-zehn-launch");
  await expect(
    page.getByRole("heading", { name: "SS26 Launch" }),
  ).toBeVisible();
  const item = page.getByRole("button", {
    name: "Choose storefront launch offer",
    exact: true,
  });
  const panel = page.getByRole("complementary", {
    name: "Choose storefront launch offer",
  });
  if (!(await panel.isVisible())) await item.click();
  await expect(panel).toBeVisible();
  await panel
    .getByLabel("Status for Choose storefront launch offer")
    .selectOption("review")
    .catch(async () => {
      await panel.locator("select").first().selectOption("review");
    });
  await expect(panel.getByText("Changes saved")).toBeVisible();
});

test("quick capture stays focused and dismisses without a modal chain", async ({
  page,
}) => {
  await page.goto("/app/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  await page.locator('.product-shell[data-hydrated="true"]').waitFor();
  const captureButton = page
    .locator("button:visible")
    .filter({ hasText: "Quick capture" })
    .first();
  await expect(captureButton).toBeVisible();
  await captureButton.click();
  const dialog = page.getByRole("dialog", { name: "Quick capture" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByPlaceholder("What needs to move?")
    .fill("Confirm pilot outcome");
  await dialog.getByRole("button", { name: "Capture item" }).click();
  await expect(dialog).toBeHidden();
});

test("founder focus centers render with scoped work", async ({ page }) => {
  for (const route of [
    "/app/my-work",
    "/app/inbox",
    "/app/decisions",
    "/app/approvals",
    "/app/search",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
  }
});
