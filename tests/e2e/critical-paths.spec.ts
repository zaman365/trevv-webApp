import { expect, test } from "@playwright/test";

test("operator starts in Home and opens a Hub from Portfolio", async ({
  page,
}) => {
  await page.goto("/app/home");
  await expect(
    page.getByRole("heading", { name: "Good morning, Mohammed" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs You" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Change Radar" }),
  ).toBeVisible();

  await page.goto("/app/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  const hubLink = page.locator('.hub-card[href="/app/hubs/northstar-apparel"]');
  await expect(hubLink).toBeVisible();
  await hubLink.click();
  await expect(
    page.getByRole("heading", { name: "Northstar Apparel" }),
  ).toBeVisible();
});

test("team member updates a board item inline and uses the detail panel", async ({
  page,
}) => {
  await page.goto("/app/hubs/northstar-apparel/boards/b-northstar-launch");
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

test("Attention signals support accountable actions", async ({ page }) => {
  await page.goto("/app/attention");
  await expect(
    page.getByRole("heading", { name: "Attention Center" }),
  ).toBeVisible();
  const signalCount = await page.locator(".attention-detail-card").count();
  const firstSignal = page.locator(".attention-detail-card").first();
  await expect(firstSignal).toBeVisible();
  await firstSignal.getByRole("button", { name: "Snooze" }).click();
  await firstSignal
    .getByPlaceholder("Waiting until Friday for client response")
    .fill("Waiting for the signed document until Friday");
  await firstSignal.getByRole("button", { name: "Save snooze" }).click();
  await expect(page.locator(".attention-detail-card")).toHaveCount(
    signalCount - 1,
  );
});

test("Waiting Center supports nudging and resolving dependencies", async ({
  page,
}) => {
  await page.goto("/app/waiting");
  await expect(
    page.getByRole("heading", { name: "Waiting Center" }),
  ).toBeVisible();
  const waitingItem = page.locator(".waiting-list article").first();
  await waitingItem.getByRole("button", { name: "Nudge" }).click();
  await expect(page.getByRole("status")).toContainText("Nudge prepared");
  await waitingItem.getByRole("button", { name: "Resolve" }).click();
  await expect(waitingItem).toBeHidden();
});

test("weekly review publishes an update and snapshot", async ({ page }) => {
  await page.goto("/app/reviews");
  await expect(
    page.getByRole("heading", { name: "Review Rituals" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish review & snapshot" }).click();
  await expect(
    page.getByRole("heading", { name: "Review published" }),
  ).toBeVisible();
  await expect(page.getByText(/Hub snapshot captured/)).toBeVisible();
});

test("Blueprint updates are previewed and preserve local overrides", async ({
  page,
}) => {
  await page.goto("/app/blueprints");
  await expect(page.getByRole("heading", { name: "Blueprints" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Local overrides preserved" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Apply \d+ selected changes/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Selected improvements applied" }),
  ).toBeVisible();
});

test("import presets require a dry-run preview", async ({ page }) => {
  await page.goto("/app/settings/import");
  await expect(
    page.getByRole("heading", { name: "Import work" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview mapping" }).click();
  await expect(page.getByText("Nothing has been imported")).toBeVisible();
  await expect(page.getByText("Unsupported", { exact: true })).toBeVisible();
});

test("stakeholder view exposes only selected information", async ({ page }) => {
  await page.goto("/app/hubs/localreach/stakeholder");
  await expect(page.getByRole("heading", { name: "LocalReach" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Selected work" }),
  ).toBeVisible();
  await expect(
    page.getByText("Stakeholder view · selected information only"),
  ).toBeVisible();
  await expect(page.getByText("Private investment note")).toHaveCount(0);
});

test("Inbox is actionable while Quick Capture remains separate", async ({
  page,
}) => {
  await page.goto("/app/inbox");
  await expect(
    page.getByRole("heading", { name: "Actionable Inbox" }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Capture a task, idea, link or note…")
    .fill("Confirm pilot outcome");
  await page
    .locator(".capture-card")
    .getByRole("button", { name: "Capture", exact: true })
    .click();
  await expect(
    page.getByText(/personal capture saved outside Inbox/),
  ).toBeVisible();
  await page
    .locator(".inbox-list article")
    .first()
    .getByRole("button", { name: "Done" })
    .click();
  await expect(page.getByText("3 requests need a response")).toBeVisible();
});

test("onboarding configures a generalized first Hub", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "What are you managing?" }),
  ).toBeVisible();
  for (const heading of [
    "Create your first Hub",
    "Choose a starter Blueprint",
    "Bring your team and context",
    "Your Portfolio is ready",
  ]) {
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Open TREVV" })).toBeVisible();
});

test("member focus centers and informational notifications render", async ({
  page,
}) => {
  for (const route of [
    "/app/my-work",
    "/app/decisions",
    "/app/approvals",
    "/app/ideas",
    "/app/team",
    "/app/notifications",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
  }
});
