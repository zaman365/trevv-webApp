import { expect, test } from "@playwright/test";
import {
  boardRoute,
  gotoCanonical,
  STAKEHOLDER_WORKSPACE,
  workspaceHome,
  workspaceRoute,
} from "./routes";

test("Portfolio carries the personal roll-ups and opens a workspace", async ({
  page,
}) => {
  // Personal roll-ups belong on Portfolio rather than a separate route.
  await gotoCanonical(page, "/app/portfolio");
  await expect(page.getByRole("heading", { name: "Needs You" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Change Radar" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Health mix" })).toBeVisible();

  // The hero select takes its accessible name from the chosen portfolio,
  // so address it structurally rather than by a fixed name.
  const portfolioSelect = page.locator(".portfolio-hero-control select");
  await expect(portfolioSelect).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) <= 520) {
    const firstStat = page.locator(".hero-stats .stat-tile").first();
    const labelBox = await firstStat.locator(".stat-body b").boundingBox();
    const valueBox = await firstStat.locator(".stat-body strong").boundingBox();
    await expect(firstStat.locator(".stat-body small")).toBeVisible();
    expect(valueBox?.x ?? 0).toBeGreaterThan(labelBox?.x ?? 0);
  }
  // The card is a div with a stretched link, so the whole card stays
  // clickable without nesting its overflow button inside an anchor.
  const workspaceLink = page.locator(
    `.project-tile .tile-link[href="${workspaceHome()}"]`,
  );
  await expect(workspaceLink).toBeVisible();
  await workspaceLink.click();
  await expect(
    page.getByRole("heading", { name: "Northstar Apparel" }),
  ).toBeVisible();
});

test("Portfolio keeps the workspace selection; switching portfolio clears it", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("dashboard"));
  const switcher = page.locator(".workspace-switcher-trigger");
  await expect(switcher).toContainText("Northstar Apparel");

  // Visiting the portfolio reports across every workspace, but the
  // member's workspace stays selected. The sidebar holding that link is
  // off-canvas below 768px.
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Portfolio", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/portfolio$/);
  await expect(page.getByRole("heading", { name: "Health mix" })).toBeVisible();
  await expect(switcher).toContainText("Northstar Apparel");

  // It survives a reload, so the selection is genuinely persisted.
  await page.reload();
  await expect(switcher).toContainText("Northstar Apparel");

  // The selection is server-rendered, so the shell paints it on the first
  // frame instead of correcting itself after hydration. Requesting the
  // page directly proves the HTML already carries it.
  const ssr = await page.request.get("/app/portfolio");
  expect(await ssr.text()).toContain("Northstar Apparel");

  // Choosing a different portfolio is the one action that clears it.
  await page
    .locator(".portfolio-hero-control select")
    .selectOption({ label: "Personal Projects" });
  await expect(switcher).toContainText("Choose workspace");
});

test("Change Radar opens the workspace update context", async ({ page }) => {
  await gotoCanonical(page, "/app/portfolio");
  const change = page.getByRole("link", {
    name: /Open Northstar Apparel and review 2 meaningful changes/,
  });
  await expect(change).toBeVisible();
  await change.click();
  await expect(page).toHaveURL(new RegExp(`${workspaceHome()}#updates$`));
  await expect(
    page.getByRole("heading", { name: /latest weekly update/i }),
  ).toBeVisible();
});

test("Dashboard turns portfolio signals into auditable next actions", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("dashboard"));
  await expect(
    page.getByRole("heading", { name: "TREVV Brief" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Decision runway" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Work lens · Needs intervention" }),
  ).toBeVisible();
  const primaryNavLabels = await page
    .locator('nav[aria-label="Primary navigation"] a')
    .allTextContents();
  // Workspace views start at Overview, so Dashboard follows it rather
  // than sitting directly under the portfolio escape hatch.
  expect(primaryNavLabels.indexOf("Overview")).toBe(
    primaryNavLabels.indexOf("Portfolio") + 1,
  );
  expect(primaryNavLabels.indexOf("Dashboard")).toBe(
    primaryNavLabels.indexOf("Overview") + 1,
  );
  // Inside a workspace the reporting hierarchy is Workspace/Team/Personal;
  // the portfolio-wide levels belong to the Portfolio surface.
  await expect(page.getByRole("tab", { name: /^Workspace\b/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("button", { name: /5 All work items/ }),
  ).toBeVisible();

  await page.getByRole("tab", { name: /^Team\b/ }).click();
  await expect(page.getByRole("combobox", { name: "Team view" })).toBeVisible();

  await page.getByRole("tab", { name: /^Personal\b/ }).click();
  await expect(page.locator(".dashboard-target-readonly")).toContainText(
    "My work",
  );
  await page.getByRole("tab", { name: /^Workspace\b/ }).click();

  await page
    .getByRole("button", { name: /1 Stuck Blocked on something/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Work lens · Blocked work" }),
  ).toBeVisible();
  await expect(page.getByText(/^1 items?$/)).toBeVisible();

  const sourceSearch = page.getByRole("textbox", {
    name: "Search dashboard source work",
  });
  await sourceSearch.fill("Northstar");
  await expect(
    page.getByRole("link", { name: /Confirm GPSR manufacturer evidence/ }),
  ).toBeVisible();
  await sourceSearch.fill("");

  await page.getByRole("button", { name: /Working on it 3 60%/ }).click();
  await expect(
    page.getByRole("heading", { name: "Work lens · Working on it" }),
  ).toBeVisible();

  // "All time" widens the work-scope filter beyond open items.
  const allTime = page.getByRole("button", { name: "All time" });
  await allTime.click();
  await expect(allTime).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Create a follow-up" }).click();
  await expect(
    page.getByRole("dialog", { name: "Create in TREVV" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Create" }).click();
});

test("a new workspace creates a working workspace and board", async ({
  page,
}) => {
  // Creation moved into the workspace switcher when the portfolio hero
  // action was removed, so the flow starts from inside a workspace.
  await gotoCanonical(page, workspaceRoute("dashboard"));
  // Below 768px the sidebar holding the switcher is off-canvas until the
  // navigation drawer is opened.
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.locator(".workspace-switcher-trigger").click();
  await page
    .getByRole("dialog", { name: "Workspace switcher" })
    .getByRole("button", { name: "New fictional workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create a workspace" }),
  ).toBeVisible();
  await page.getByLabel("Workspace name").fill("Customer Onboarding Lab");
  await page
    .getByLabel("Current priority")
    .fill("Validate the first onboarding outcome");
  await page
    .getByRole("button", { name: "Create fictional workspace" })
    .click();

  // The dialog routes straight into the workspace it just created.
  await expect(page).toHaveURL(/\/app\/workspaces\/customer-onboarding-lab$/);
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
  await gotoCanonical(page, boardRoute());
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
  const status = panel.getByLabel("Status for Choose storefront launch offer");
  await status.selectOption("review").catch(async () => {
    await panel.locator("select").first().selectOption("review");
  });
  await expect(status).toHaveValue("review");
  await expect(
    panel.getByText(
      "Comments and links stay in this browser. File upload is unavailable.",
    ),
  ).toBeVisible();
});

test("board controls add, filter, and expose item editing", async ({
  page,
}) => {
  await gotoCanonical(page, boardRoute());
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
  await gotoCanonical(page, workspaceRoute("attention"));
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

test("Waiting Center supports local follow-up drafts and resolving dependencies", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("waiting"));
  await expect(
    page.getByRole("heading", { name: "Waiting Center" }),
  ).toBeVisible();
  // Scoped to one workspace the default view is empty, so select the
  // bucket that actually holds a dependency.
  await page.getByRole("button", { name: /^Waiting on External/ }).click();
  const waitingItem = page.locator(".waiting-list article").first();
  await waitingItem.getByRole("button", { name: "Draft follow-up" }).click();
  await page
    .getByRole("dialog", { name: "Prepare a focused nudge" })
    .getByRole("button", { name: "Save local preview" })
    .click();
  await expect(page.getByRole("status")).toContainText("Follow-up prepared");
  await waitingItem.getByRole("button", { name: "Resolve" }).click();
  await page
    .getByRole("dialog", { name: "Mark this dependency resolved?" })
    .getByRole("button", { name: "Mark resolved" })
    .click();
  await expect(waitingItem).toBeHidden();
});

test("weekly review saves a local sample", async ({ page }) => {
  await gotoCanonical(page, workspaceRoute("reviews"));
  await expect(
    page.getByRole("heading", { name: "Review Rituals" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save sample review locally" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sample review saved locally" }),
  ).toBeVisible();
  await expect(page.getByText(/browser-local update/)).toBeVisible();
});

test("Blueprint updates are previewed and preserve local overrides", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("blueprints"));
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
  await gotoCanonical(page, workspaceRoute("settings/import"));
  await expect(
    page.getByRole("heading", { name: "Preview an import" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview mapping" }).click();
  await expect(page.getByText("Nothing has been imported")).toBeVisible();
  await expect(page.getByText("Unsupported", { exact: true })).toBeVisible();
});

test("stakeholder view exposes only selected information", async ({ page }) => {
  await gotoCanonical(
    page,
    `${workspaceHome(STAKEHOLDER_WORKSPACE)}/stakeholder`,
  );
  await expect(page.getByRole("heading", { name: "LocalReach" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Selected work" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /future sharing boundary; it is not authenticated or permission-enforced/,
    ),
  ).toBeVisible();
  await expect(page.getByText("Private investment note")).toHaveCount(0);
});

test("Inbox is actionable while Quick Capture remains separate", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("inbox"));
  await page.getByRole("tab", { name: /^Sample Email/ }).click();
  await expect(
    page.getByRole("button", { name: "Manage sample accounts" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Workspace Actionable/ }).click();
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
  // Counts render beside the tab rather than inside its name, so assert
  // the queue actually drained instead of a hard-coded total.
  await expect(page.getByRole("tab", { name: "Done" })).toBeVisible();
  await expect(page.locator(".inbox-list article")).toHaveCount(0);
});

test("Messages keeps requests, threads, and project context connected", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("messages"));
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New sample conversation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add sample room", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Northstar · Launch room/ })
      .locator("strong"),
  ).toBeVisible();
  await expect(
    page.locator(".group-teams").getByRole("button", { name: /Leadership/ }),
  ).toBeVisible();
  await expect(
    page
      .locator(".group-rooms")
      .getByRole("button", { name: /Northstar · Launch room/ }),
  ).toBeVisible();
  await expect(
    page.locator(".group-people").getByRole("button", { name: /Nora Klein/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Needs response \d+/ }),
  ).toBeVisible();
  const workspaceContextLink = page.getByRole("link", {
    name: "Open workspace",
  });
  if (!(await workspaceContextLink.isVisible()))
    await page.getByRole("button", { name: "Open room context" }).click();
  await expect(workspaceContextLink).toBeVisible();
  const closeContext = page.getByRole("button", { name: "Close room context" });
  if (await closeContext.isVisible()) await closeContext.click();

  await page.getByRole("button", { name: "Mark answered" }).click();
  await expect(page.getByRole("status")).toContainText("Response loop closed");

  await page.getByRole("button", { name: /1 reply Open thread/ }).click();
  await page.getByPlaceholder("Reply in thread…").fill("Margin check noted.");
  await page
    .getByRole("button", { name: "Add sample reply", exact: true })
    .click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: "Margin check noted." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close thread" }).click();

  await page
    .getByRole("button", { name: "Add sample room", exact: true })
    .click();
  await page.getByLabel("Room name").fill("Northstar launch support");
  await page
    .getByLabel("Purpose")
    .fill("Coordinate launch-day support and escalation ownership.");
  await page
    .getByRole("dialog", { name: "Add a sample work room" })
    .getByRole("button", { name: "Add sample room" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Sample room Northstar launch support added locally; no access was granted",
  );
});

test("onboarding configures a generalized first project", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "What are you managing?" }),
  ).toBeVisible();
  for (const heading of [
    "Create your first Workspace",
    "Choose a starter Blueprint",
    "Bring your team and context",
    "Your Portfolio is ready",
  ]) {
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("link", { name: "Open fictional sample" }),
  ).toBeVisible();
});

test("member focus centers and informational notifications render", async ({
  page,
}) => {
  // Each module needs its own landmark heading. Asserting only that a
  // <main> exists passed even when the route redirected to Portfolio.
  const modules = [
    { view: "my-work", heading: "My Work" },
    { view: "decisions", heading: "Decision Center" },
    { view: "approvals", heading: "Approval Center" },
    { view: "ideas", heading: "Ideas & evidence" },
    { view: "teams", heading: "Workspace teams" },
    { view: "notifications", heading: "Notifications" },
  ];
  for (const { view, heading } of modules) {
    await gotoCanonical(page, workspaceRoute(view));
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
  }
});

test("workspace teams create groups, assign people, and expose inherited features", async ({
  page,
}) => {
  await gotoCanonical(page, workspaceRoute("teams"));

  await expect(
    page.getByRole("region", { name: "Fictional teams in this Workspace" }),
  ).toContainText("Marketing");
  await page
    .getByRole("button", { name: "Add sample team", exact: true })
    .click();

  const createTeam = page.getByRole("dialog", { name: "Add a team" });
  await createTeam.getByLabel("Team name").fill("Operations");
  await createTeam
    .getByLabel("Purpose")
    .fill("Run delivery, staffing, and operational handoffs.");
  await createTeam.getByLabel("Team lead").selectOption({ index: 1 });
  await createTeam.getByLabel(/Approvals/).check();
  await createTeam.getByRole("button", { name: "Add sample team" }).click();

  await expect(
    page.getByRole("heading", { name: "Operations", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Prepare sample invite", exact: true })
    .click();
  const invite = page.getByRole("dialog", {
    name: "Prepare a sample invitation",
  });
  await invite.getByLabel("Name").fill("Test Operator");
  await invite.getByLabel("Fictional email").fill("operator@example.invalid");
  await invite.getByLabel("Operations").check();
  await invite
    .getByRole("button", { name: "Prepare invitation draft" })
    .click();

  await expect(page.getByRole("status")).toContainText(
    "No external email is sent in this demo",
  );
  await expect(
    page.getByRole("button", {
      name: /Test Operator Invite draft · no email sent/,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Manage teams for Test Operator" })
    .click();
  const member = page.getByRole("dialog", { name: "Test Operator" });
  await expect(member.getByLabel("Operations")).toBeChecked();
  await expect(
    member.getByText("Boards & tasks", { exact: true }),
  ).toBeVisible();
  await expect(
    member.getByText("Team messages", { exact: true }),
  ).toBeVisible();
  await expect(member.getByText("Approvals", { exact: true })).toBeVisible();
  await member.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Operations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage teams for Test Operator" }),
  ).toContainText("Operations");

  await gotoCanonical(page, workspaceRoute("messages"));
  await expect(
    page.locator(".group-teams").getByRole("button", { name: /Operations/ }),
  ).toBeVisible();
  await expect(page.locator(".group-rooms .conversation-row")).not.toHaveCount(
    0,
  );
  await expect(page.locator(".group-people .conversation-row")).not.toHaveCount(
    0,
  );
});
