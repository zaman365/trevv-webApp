import { expect, test } from "@playwright/test";
import { gotoCanonical, workspaceHome, workspaceRoute } from "./routes";

test("profile menu dismisses outside and with Escape while its controls keep working", async ({
  page,
  isMobile,
}) => {
  // Phones use the bottom navigation; exercise the profile menu on a touch tablet.
  if (isMobile) await page.setViewportSize({ width: 1024, height: 900 });
  await gotoCanonical(page, workspaceHome());
  const trigger = page.getByRole("button", {
    name: "Open user menu",
    exact: true,
  });
  const menu = page.getByRole("menu");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await menu.locator("header").click();
  await expect(menu).toBeVisible();

  const outside = page.getByRole("heading", { name: "Dashboard", exact: true });
  if (isMobile) await outside.tap();
  else await outside.click();
  await expect(menu).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await trigger.click();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await menu
    .getByRole("menuitem", { name: "Workspace settings", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await menu
    .getByRole("menuitem", { name: "Switch to dark mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await menu
    .getByRole("menuitem", { name: "Switch to light mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await trigger.click();
  await page.locator(".topbar .search-trigger").click();
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${workspaceRoute("search")}$`));
});

test("the workspace toolbar stays fixed during wheel scrolling and at page boundaries", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceHome());
  const toolbar = page.locator(".topbar");
  const title = page.getByRole("heading", { name: "Dashboard", exact: true });
  await expect(title).toBeVisible();
  await expect(toolbar).toHaveCSS("position", "fixed");
  const original = await toolbar.boundingBox();
  expect(original?.y).toBe(0);
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(
    original!.height,
  );
  const viewport = page.viewportSize()!;
  const sidebarVisible = viewport.width > 820;
  expect(original!.x).toBe(sidebarVisible ? 248 : 0);
  await page.mouse.move(viewport.width - 30, 300);
  for (const delta of [700, 4000, 4000, -10000, -1000]) {
    await page.mouse.wheel(0, delta);
    // Observe multiple animation frames, not just the final settled position.
    const positions = await toolbar.evaluate(async (element) => {
      const frames = [];
      for (let index = 0; index < 12; index++) {
        await new Promise(requestAnimationFrame);
        const rect = element.getBoundingClientRect();
        frames.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
      }
      return frames;
    });
    for (const position of positions) expect(position).toEqual(original);
    if (delta === 700)
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  }
  await toolbar.locator(".search-trigger").click();
  await expect(page).toHaveURL(new RegExp(`${workspaceRoute("search")}$`));
  await expect(toolbar).toHaveCSS("position", "fixed");
});

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
