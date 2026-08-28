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
  const portfolioSelect = page.getByRole("combobox", {
    name: "Portfolio",
    exact: true,
  });
  const newProject = page.getByRole("link", { name: "New project" });
  await expect(portfolioSelect).toBeVisible();
  await expect(newProject).toBeVisible();
  const portfolioSelectBox = await portfolioSelect.boundingBox();
  const newProjectBox = await newProject.boundingBox();
  expect(portfolioSelectBox).not.toBeNull();
  expect(newProjectBox).not.toBeNull();
  expect(
    Math.abs(
      (portfolioSelectBox?.y ?? 0) +
        (portfolioSelectBox?.height ?? 0) -
        ((newProjectBox?.y ?? 0) + (newProjectBox?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(1);
  if ((page.viewportSize()?.width ?? 0) <= 520) {
    const firstStat = page.locator(".hero-stats .stat-tile").first();
    const labelBox = await firstStat.locator(".stat-body b").boundingBox();
    const valueBox = await firstStat.locator(".stat-body strong").boundingBox();
    await expect(firstStat.locator(".stat-body small")).toBeVisible();
    expect(valueBox?.x ?? 0).toBeGreaterThan(labelBox?.x ?? 0);
  }
  // The card is a div with a stretched link, so the whole card stays
  // clickable without nesting its overflow button inside an anchor.
  const hubLink = page.locator(
    '.project-tile .tile-link[href="/app/hubs/northstar-apparel"]',
  );
  await expect(hubLink).toBeVisible();
  await hubLink.click();
  await expect(
    page.getByRole("heading", { name: "Northstar Apparel" }),
  ).toBeVisible();
});

test("Change Radar opens the project update context", async ({ page }) => {
  await page.goto("/app/home");
  const change = page.getByRole("link", {
    name: /Open Northstar Apparel and review 2 meaningful changes/,
  });
  await expect(change).toBeVisible();
  await change.click();
  await expect(page).toHaveURL(/\/app\/hubs\/northstar-apparel#updates$/);
  await expect(
    page.getByRole("heading", { name: /latest weekly update/i }),
  ).toBeVisible();
});

test("Dashboard turns portfolio signals into auditable next actions", async ({
  page,
}) => {
  await page.goto("/app/dashboard");
  await expect(
    page.getByRole("heading", { name: "TREVV Brief" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Decision runway" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Work lens · Needs intervention" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /4 Stuck Blocked on something/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Work lens · Blocked work" }),
  ).toBeVisible();
  await expect(page.getByText("4 items", { exact: true })).toBeVisible();

  const sourceSearch = page.getByRole("textbox", {
    name: "Search dashboard source work",
  });
  await sourceSearch.fill("Northstar");
  await expect(
    page.getByRole("link", { name: /Confirm GPSR manufacturer evidence/ }),
  ).toBeVisible();
  await sourceSearch.fill("");

  await page.getByRole("button", { name: /Working on it 7 41%/ }).click();
  await expect(
    page.getByRole("heading", { name: "Work lens · Working on it" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "All time" }).click();
  await expect(page.getByRole("group", { name: /Done: 1/ })).toBeVisible();

  await page.getByRole("button", { name: "Create a follow-up" }).click();
  await expect(
    page.getByRole("dialog", { name: "Create in TREVV" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Create" }).click();
});

test("a new project creates a working Hub and board", async ({ page }) => {
  await page.goto("/app/portfolio");
  await page.getByRole("link", { name: "New project" }).click();
  await expect(
    page.getByRole("heading", { name: "Create a project Hub" }),
  ).toBeVisible();
  await page.getByLabel("Project name").fill("Customer Onboarding Lab");
  await page
    .getByLabel("Current priority")
    .fill("Validate the first onboarding outcome");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("status")).toContainText(
    "project and its first board are ready",
  );
  await page.getByRole("link", { name: "Open project" }).click();
  await expect(
    page.getByRole("heading", { name: "Customer Onboarding Lab" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add item" }).click();
  await expect(
    page.getByRole("heading", { name: "Customer Onboarding Lab Board" }),
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

test("board controls add, filter, and expose item editing", async ({
  page,
}) => {
  await page.goto("/app/hubs/northstar-apparel/boards/b-northstar-launch");
  const initiallySelected = page.locator(".item-panel");
  if (await initiallySelected.isVisible()) {
    await initiallySelected.getByLabel("Close").click();
  }
  await page
    .getByRole("main")
    .locator("header")
    .getByRole("button", { name: "Add item", exact: true })
    .click();
  const panel = page.locator(".item-panel");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Item title").fill("Confirm retail launch checklist");
  await panel.getByLabel("Close").click();
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByPlaceholder("Find a work item…").fill("retail launch");
  await expect(
    page.getByRole("button", {
      name: "Confirm retail launch checklist",
      exact: true,
    }),
  ).toBeVisible();
});

test("Attention signals support accountable actions", async ({ page }) => {
  await page.goto("/app/attention");
  await expect(
    page.getByRole("heading", { name: "Attention Center" }),
  ).toBeVisible();
  const signalCount = await page.locator(".attention-action-card").count();
  const firstSignal = page.locator(".attention-action-card").first();
  await expect(firstSignal).toBeVisible();
  await firstSignal.getByRole("button", { name: "Snooze" }).click();
  const snoozeDialog = page.getByRole("dialog", {
    name: "Snooze with a reason",
  });
  await snoozeDialog
    .getByPlaceholder("Waiting for the supplier response before Friday…")
    .fill("Waiting for the signed document until Friday");
  await snoozeDialog.getByLabel("Snooze until").fill("2026-08-30");
  await snoozeDialog.getByRole("button", { name: "Save snooze" }).click();
  await expect(page.locator(".attention-action-card")).toHaveCount(
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
  await page
    .getByRole("dialog", { name: "Prepare a focused nudge" })
    .getByRole("button", { name: "Record email note" })
    .click();
  await expect(page.getByRole("status")).toContainText("Follow-up prepared");
  await waitingItem.getByRole("button", { name: "Resolve" }).click();
  await page
    .getByRole("dialog", { name: "Mark this dependency resolved?" })
    .getByRole("button", { name: "Mark resolved" })
    .click();
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
  await expect(
    page.getByRole("heading", { name: /^Blueprints/, level: 1 }),
  ).toBeVisible();
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
  await page.getByRole("tab", { name: /^Actionable Inbox/ }).click();
  await expect(
    page.getByRole("heading", {
      name: /^Actionable Inbox/,
      level: 2,
    }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Capture a task, idea, link, note, request, or decision…")
    .fill("Confirm pilot outcome");
  await page
    .locator(".capture-card")
    .getByRole("button", { name: "Capture", exact: true })
    .click();
  await expect(
    page.getByText(/Task captured for later organization/),
  ).toBeVisible();
  await page
    .locator(".inbox-list article")
    .first()
    .getByRole("button", { name: "Done" })
    .click();
  await expect(
    page.getByRole("tab", { name: "Needs response 3" }),
  ).toBeVisible();
});

test("Messages keeps requests, threads, and Hub context connected", async ({
  page,
}) => {
  await page.goto("/app/messages");
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New message" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Northstar · Launch room/ })
      .locator("strong"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Leadership decisions/ })
      .locator("strong"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Needs response \d+/ }),
  ).toBeVisible();
  const hubContextLink = page.getByRole("link", { name: "Open Hub" });
  if (!(await hubContextLink.isVisible()))
    await page.getByRole("button", { name: "Open room context" }).click();
  await expect(hubContextLink).toBeVisible();
  const closeContext = page.getByRole("button", { name: "Close room context" });
  if (await closeContext.isVisible()) await closeContext.click();

  await page.getByRole("button", { name: "Mark answered" }).click();
  await expect(page.getByRole("status")).toContainText("Response loop closed");

  await page.getByRole("button", { name: /1 reply Open thread/ }).click();
  await page.getByPlaceholder("Reply in thread…").fill("Margin check noted.");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: "Margin check noted." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close thread" }).click();

  await page.getByRole("button", { name: "Create room" }).click();
  await page.getByLabel("Room name").fill("Northstar launch support");
  await page
    .getByLabel("Purpose")
    .fill("Coordinate launch-day support and escalation ownership.");
  await page
    .getByRole("dialog", { name: "Create a work room" })
    .getByRole("button", { name: "Create room" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Northstar launch support is ready",
  );
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
