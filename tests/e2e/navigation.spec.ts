import { expect, test } from "@playwright/test";
import { gotoCanonical, workspaceHome, workspaceRoute } from "./routes";

test("page switches acknowledge clicks while retaining the current workspace until navigation completes", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceHome());
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const destination = workspaceRoute("calendar");
  await page.route(`**${destination}*`, async (route) => {
    if (route.request().headers().rsc === "1") await paused;
    await route.continue();
  });
  if ((page.viewportSize()?.width ?? 0) < 768)
    await page.getByRole("button", { name: "Open navigation" }).click();
  const calendar = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Calendar", exact: true });
  try {
    await calendar.click();
    await expect(calendar.locator("[data-navigation-pending]")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Northstar Apparel", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".product-shell:visible")).toHaveCount(1);
  } finally {
    release();
  }
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-navigation-pending]")).toHaveCount(0);
});
