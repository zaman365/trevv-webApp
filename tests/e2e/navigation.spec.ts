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
    .getByRole("navigation", {
      name: "Primary navigation",
      includeHidden: true,
    })
    .getByRole("link", { name: "Calendar", exact: true, includeHidden: true });
  try {
    await calendar.click();
    await expect(calendar.locator("[data-navigation-pending]")).toHaveCount(1);
    // The drawer closes on mobile. Feedback must remain visible outside it,
    // while its hidden links stay out of keyboard/accessibility navigation.
    await expect(page.locator("[data-navigation-progress]")).toBeVisible();
    await expect(page.locator("[data-navigation-progress]")).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(page.locator("[data-navigation-progress]")).toHaveText(
      "Opening page",
    );
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".workspace-switcher-trigger")).toContainText(
      "Northstar Apparel",
    );
    await expect(page.locator(".product-shell:visible")).toHaveCount(1);
  } finally {
    release();
  }
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-navigation-pending]")).toHaveCount(0);
  await expect(page.locator("[data-navigation-progress]")).toHaveCount(0);
});
