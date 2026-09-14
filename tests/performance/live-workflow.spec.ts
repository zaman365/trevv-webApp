import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { WorkItemDto } from "@founderhq/api-contract";
import {
  board,
  item,
  members,
  snapshot,
  teams,
} from "../../apps/web/test-fixtures/live-workflow-data";
import { setup } from "../fixtures/live-workflow-browser";

async function openTaskEditor(page: Page, id = item.id) {
  await page.goto(`https://trevv.test/app/workspaces/launch/tasks/${id}#edit`);
  const detail = page.getByTestId("work-item-detail");
  await expect(detail).toBeVisible();
  for (const title of [
    "Assign an owner",
    "Edit task details",
    "Progress, blockers, follow-ups & completion",
    "Post an update or evidence",
    "Evidence & change history",
  ])
    await detail.getByText(title, { exact: true }).click();
  return detail;
}

test("dashboard keeps worker status loading when boards finish first", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await setup(page, "", {
      dashboard: true,
      operations: async (route) => {
        await pending;
        await route.fulfill({ json: { pendingOutbox: 3, failedCount: 0 } });
      },
    });
    const health = page.getByRole("region", { name: "Update delivery" });
    await expect(
      health.getByText("Loading worker status", { exact: true }),
    ).toBeVisible();
    await expect(health.getByRole("alert")).toHaveCount(0);
    release();
    await expect(health.getByText("Updates waiting")).toBeVisible();
    await expect(
      health.getByText("Loading worker status", { exact: true }),
    ).toHaveCount(0);
    await expect(health.getByRole("alert")).toHaveCount(0);
  } finally {
    release();
  }
});

test("team summary cards open team details, unique people assignments, and accessible rooms", async ({
  page,
}) => {
  await setup(page, "", { view: "teams", teams });
  const summary = page.getByRole("region", { name: "Team summary" });
  const teamCard = summary.getByRole("button", { name: "3 Teams View teams" });
  const peopleCard = summary.getByRole("button", {
    name: "2 Assigned people View people",
  });
  const roomsCard = summary.getByRole("button", {
    name: "3 Synchronized rooms View rooms",
  });

  await teamCard.focus();
  await page.keyboard.press("Enter");
  const teamSummary = page.getByRole("dialog", { name: "Teams", exact: true });
  await expect(teamSummary.getByRole("listitem")).toHaveCount(3);
  await expect(teamSummary).toContainText("Bring the launch to customers.");
  await expect(teamSummary).toContainText("Lead: Owner");
  await teamSummary
    .getByRole("button", { name: "View Launch team details" })
    .click();
  const details = page.getByRole("dialog", {
    name: "Launch team",
    exact: true,
  });
  await expect(teamSummary).toHaveCount(0);
  await expect(
    details.getByRole("button", { name: "People (2)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(details.getByText(/teammate@example\.test/)).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Projects and work" }),
  ).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Topics and discussions" }),
  ).toBeVisible();
  await details.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(details.getByLabel("Name", { exact: true })).toBeEditable();
  await page.keyboard.press("Escape");
  await expect(teamCard).toBeFocused();

  await peopleCard.click();
  const people = page.getByRole("dialog", { name: "Assigned people" });
  await expect(people.getByRole("listitem")).toHaveCount(2);
  const owner = people
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Owner", exact: true }) });
  await expect(owner).toContainText("owner@example.test");
  await expect(owner).toContainText("Launch team · Lead");
  await expect(owner).toContainText("Operations · Member");
  await owner
    .getByRole("button", {
      name: "Operations · Member: View team members for Owner",
    })
    .click();
  const operations = page.getByRole("dialog", {
    name: "Operations",
    exact: true,
  });
  await expect(
    operations.getByRole("button", { name: "People (1)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await operations
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(operations.getByLabel("Name", { exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(peopleCard).toBeFocused();

  await roomsCard.click();
  const rooms = page.getByRole("dialog", { name: "Synchronized rooms" });
  await expect(rooms.getByRole("listitem")).toHaveCount(3);
  await expect(rooms).toContainText("3 unread messages");
  await expect(rooms).toContainText("Up to date");
  const privateRoom = rooms.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Private team", exact: true }),
  });
  await expect(privateRoom).toContainText("Private to team members");
  await expect(privateRoom.getByRole("link")).toHaveCount(0);
  await privateRoom
    .getByRole("button", { name: "View Private team members" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Private team", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(roomsCard).toBeFocused();
  await roomsCard.click();
  const roomLink = rooms.getByRole("link", { name: "Open Launch team room" });
  await expect(roomLink).toHaveAttribute(
    "href",
    "/app/workspaces/launch/messages#room-launch",
  );
  await page.route(
    "https://trevv.test/app/workspaces/launch/messages",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Room destination</h1>",
      }),
  );
  await roomLink.click();
  await expect(page).toHaveURL(
    "https://trevv.test/app/workspaces/launch/messages#room-launch",
  );
});

test("team summary details stay current and close when directory access is lost", async ({
  page,
}) => {
  const state = await setup(page, "", { view: "teams", teams });
  const summary = page.getByRole("region", { name: "Team summary" });
  await summary.getByRole("button", { name: /Assigned people/ }).click();
  const people = page.getByRole("dialog", { name: "Assigned people" });
  await expect(people.getByRole("listitem")).toHaveCount(2);
  state.setTeams(
    teams.map((team) => ({
      ...team,
      members: team.members.filter((member) => member.user.id !== "user-two"),
    })),
  );
  await expect(people.getByRole("listitem")).toHaveCount(1, {
    timeout: 10_000,
  });
  await expect(
    summary.getByRole("button", { name: /Assigned people/ }),
  ).toContainText("1");
  state.denyTeamAccess();
  await expect(people).toHaveCount(0, { timeout: 15_000 });
  for (const card of await summary.getByRole("button").all())
    await expect(card).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Launch team", exact: true }),
  ).toHaveCount(0);
});

test("team summary cards provide empty details without inventing people or rooms", async ({
  page,
}) => {
  await setup(page, "", { view: "teams" });
  const summary = page.getByRole("region", { name: "Team summary" });
  for (const [name, message] of [
    ["Teams", "No teams yet."],
    ["Assigned people", "No assigned people yet."],
    ["Synchronized rooms", "No team rooms yet."],
  ]) {
    const card = summary.getByRole("button", { name: new RegExp(name) });
    await expect(card).toContainText("0");
    await card.click();
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toContainText(message);
    await expect(dialog.getByRole("listitem")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close team summary" }).click();
    await expect(card).toBeFocused();
  }
});

for (const theme of ["light", "dark"] as const)
  test(`team summary panels fit mobile screens and keep keyboard focus inside in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page, "", { view: "teams", teams });
    const summary = page.getByRole("region", { name: "Team summary" });
    await summary.screenshot({
      path: test.info().outputPath("team-summary-mobile.png"),
    });
    const peopleCard = summary.getByRole("button", { name: /Assigned people/ });
    await peopleCard.focus();
    await page.keyboard.press("Space");
    const dialog = page.getByRole("dialog", { name: "Assigned people" });
    const close = dialog.getByRole("button", { name: "Close team summary" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button").last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: test.info().outputPath("assigned-people-mobile.png"),
    });
    const accessibility = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(peopleCard).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await summary.screenshot({
      path: test.info().outputPath("team-summary-desktop.png"),
    });
    await peopleCard.click();
    await page.screenshot({
      path: test.info().outputPath("assigned-people-desktop.png"),
    });
    await page.mouse.click(10, 10);
    await expect(dialog).toHaveCount(0);
    await expect(peopleCard).toBeFocused();
  });

test("dashboard shows a real worker status failure and supports retry", async ({
  page,
}) => {
  let failing = true;
  await setup(page, "", {
    dashboard: true,
    operations: (route) =>
      route.fulfill(
        failing
          ? {
              status: 503,
              json: {
                error: {
                  code: "temporarily_unavailable",
                  message: "Temporary test outage",
                },
              },
            }
          : { json: { pendingOutbox: 0, failedCount: 0 } },
      ),
  });
  const health = page.getByRole("region", { name: "Update delivery" });
  await expect(health.getByRole("alert")).toContainText(
    "Worker status is unavailable",
  );
  failing = false;
  await health.getByRole("button", { name: "Retry worker status" }).click();
  await expect(health.getByText("Updates waiting")).toBeVisible();
  await expect(health.getByRole("alert")).toHaveCount(0);
});

test("dashboard charts drill into saved work and preserve inline status updates", async ({
  page,
}) => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const records: WorkItemDto[] = [
    { ...item, id: "complete", title: "Completed launch", status: "done" },
    {
      ...item,
      id: "blocked",
      title: "Blocked launch",
      status: "blocked",
      dueDate: "2020-01-01",
      assignees: [{ id: "user-one", name: "Owner" }],
    },
    {
      ...item,
      id: "working",
      title: "Campaign creative",
      status: "working",
      dueDate: today,
      assignees: [{ id: "user-two", name: "Teammate" }],
    },
    {
      ...item,
      id: "milestone",
      title: "Launch milestone",
      type: "milestone",
      dueDate: "2099-01-01",
    },
  ];
  const state = await setup(page, "", { dashboard: true, records });
  await page
    .getByRole("button", { name: "Refresh test records", exact: true })
    .click();
  const totals = page.getByRole("region", { name: "Workspace totals" });
  await expect(totals.getByRole("button", { name: /Open work/ })).toContainText(
    "3",
  );
  await expect(
    page.getByRole("img", { name: "1 of 4 work items completed", exact: true }),
  ).toBeVisible();
  await totals.getByRole("button", { name: /Completed/ }).click();
  const source = page.locator("#dashboard-source-work");
  await expect(
    source.getByRole("link", { name: /Completed launch/ }),
  ).toBeVisible();
  await expect(
    source.getByRole("link", { name: /Blocked launch/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show blocked work: 1", exact: true })
    .click();
  await expect(
    source.getByRole("link", { name: /Blocked launch/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show in progress work: 1", exact: true })
    .click();
  await source.getByRole("button", { name: "List", exact: true }).click();
  await source
    .getByRole("button", {
      name: "Edit status for Campaign creative",
      exact: true,
    })
    .click();
  await source
    .getByRole("combobox", {
      name: "Status for Campaign creative",
      exact: true,
    })
    .selectOption("review");
  await expect(
    page.getByText("Server confirmed “Campaign creative”"),
  ).toBeVisible();
  expect(state.transitions).toContainEqual(
    expect.objectContaining({
      path: "/api/v1/items/working",
      body: { status: "review" },
    }),
  );
  await page
    .getByRole("button", { name: "Clear chart filter", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Dashboard people", exact: true })
    .selectOption("mine");
  await expect(totals.getByRole("button", { name: /Open work/ })).toContainText(
    "1",
  );
  await expect(
    source.getByRole("link", { name: /Campaign creative/ }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Dashboard people", exact: true })
    .selectOption("all");
  await page
    .getByRole("combobox", { name: "Dashboard deadline window", exact: true })
    .selectOption("30");
  await expect(
    page
      .getByRole("region", { name: "Upcoming deadlines" })
      .getByRole("combobox", { name: "Work due on" })
      .locator("option"),
  ).toHaveCount(31);
  await page.getByRole("combobox", { name: "Work due on" }).selectOption(today);
  await expect(
    source.getByRole("link", { name: /Campaign creative/ }),
  ).toBeVisible();
  await expect(
    source.getByRole("link", { name: /Blocked launch/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Milestones", exact: true }),
  ).toContainText("Launch milestone");
});

test("creation assigns work, opens its details, and survives a slow post-save refresh", async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "New task / work item" }).click();
  const form = page.getByTestId("create-item-dialog");
  await form.getByLabel("Title", { exact: true }).fill("Prepare launch");
  await form.getByLabel("Choose assignee").selectOption("user-one");
  state.hold();
  try {
    await form
      .getByRole("button", { name: "Create task / work item", exact: true })
      .click();
    await expect(form).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Prepare launch", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/tasks\//);
    expect(state.creations[0].assigneeIds).toEqual(["user-one"]);
  } finally {
    state.release();
  }
});

test("Inbox capture appears without navigation and keeps its assignee through conversion", async ({
  page,
}) => {
  const state = await setup(page);
  await expect(page.getByText("Inbox is clear", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /^Captured work/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /^Sample Email/ })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /^Workspace Actionable/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Quick capture", exact: true })
    .click();
  const form = page.getByTestId("live-quick-capture");
  await form
    .getByText("Optional: save to Inbox for later", { exact: true })
    .click();
  await form.getByRole("radio", { name: /Inbox first/ }).check();
  await form
    .getByLabel("Title", { exact: true })
    .fill("Follow through on launch");
  await form.getByLabel("Choose assignee").selectOption("user-one");
  state.holdInbox();
  try {
    await form.getByTestId("live-capture-submit").click();
    await expect(form).toHaveCount(0);
    const captured = page.getByTestId("inbox-item-capture-one");
    await expect(captured).toContainText("Follow through on launch");
    await captured.getByRole("button", { name: "Convert to WorkItem" }).click();
    await expect(captured).toContainText("Converted to WorkItem");
    await expect(
      captured.getByRole("link", { name: "Open work item" }),
    ).toHaveAttribute(
      "href",
      "/app/workspaces/launch/boards/board-one#capture-one",
    );
    await expect(page.getByRole("region", { name: "My tasks" })).toContainText(
      "Follow through on launch",
    );
    expect(state.conversions[0].assigneeIds).toEqual(["user-one"]);
  } finally {
    state.release();
  }
});

test("task details support assignment, progress, and evidence-backed completion with current versions", async ({
  page,
}) => {
  const state = await setup(page);
  const detail = await openTaskEditor(page);
  await detail
    .getByLabel("Reason or follow-up note")
    .fill("Preserve the next follow-up");
  await detail.getByLabel("Choose assignee").selectOption("user-one");
  await detail.getByTestId(`assign-item-${item.id}`).click();
  await expect(detail).toContainText("Assigned to: Owner");
  await expect(detail.getByLabel("Work status")).toBeEnabled();
  await detail.getByLabel("Work status").selectOption("working");
  await expect(detail.getByLabel("Work status")).toHaveValue("working");
  await expect(detail.getByLabel("Work status")).toBeEnabled();
  await expect(detail.getByLabel("Reason or follow-up note")).toHaveValue(
    "Preserve the next follow-up",
  );
  const resolveButton = detail.getByTestId(`resolve-item-${item.id}`);
  await expect(resolveButton).toBeDisabled();
  await detail
    .getByRole("textbox", { name: "Evidence", exact: true })
    .fill("Launch checklist completed and verified");
  await resolveButton.click();
  await expect(detail.getByLabel("Work status")).toHaveValue("done");
  await expect(resolveButton).toBeDisabled();
  await expect(
    page.getByRole("list", { name: "Task lifecycle" }),
  ).toContainText("Completed");
  expect(state.transitions.map((transition) => transition.version)).toEqual([
    '"1"',
    '"2"',
    '"3"',
  ]);
  expect(state.transitions[2].body.evidence).toBe(
    "Launch checklist completed and verified",
  );
  await detail.getByRole("button", { name: "Reopen task" }).click();
  await expect(detail.getByLabel("Work status")).toHaveValue("not_started");
  await expect(
    page.getByRole("heading", { name: item.title, exact: true }).first(),
  ).toBeVisible();
});

test("failed direct capture retains the draft, assignee, and safe retry key", async ({
  page,
}) => {
  await setup(page);
  const keys: string[] = [];
  await page.route("**/api/v1/items", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1)
      return route.fulfill({
        status: 502,
        json: { error: { code: "test_unavailable", message: "Try again" } },
      });
    return route.fallback();
  });
  await page
    .getByRole("button", { name: "Quick capture", exact: true })
    .click();
  const form = page.getByTestId("live-quick-capture");
  await expect(form.getByLabel("Direct to board")).toBeChecked();
  await form.getByLabel("Title", { exact: true }).fill("Keep this assignment");
  await form.getByLabel("Choose assignee").selectOption("user-two");
  await form.getByTestId("live-capture-submit").click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep this assignment",
  );
  await expect(form.getByLabel("Choose assignee")).toHaveValue("user-two");
  await form.getByTestId("live-capture-submit").click();
  await expect(form).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});

test("direct capture confirms immediately and identifies the actual saved board item", async ({
  page,
}) => {
  const state = await setup(page);
  await page
    .getByRole("button", { name: "Quick capture", exact: true })
    .click();
  const form = page.getByTestId("live-quick-capture");
  await expect(form.getByLabel("Direct to board")).toBeChecked();
  await form.getByLabel("Title", { exact: true }).fill("Task for teammate");
  await form.getByLabel("Choose assignee").selectOption("user-two");
  state.hold();
  try {
    await form.getByTestId("live-capture-submit").click();
    await expect(form).toHaveCount(0);
    await expect(page.locator("#capture-result")).toContainText(
      '"boardId":"board-one"',
    );
    await expect(page.locator("#capture-result")).toContainText(
      '"recordId":"created-item"',
    );
    expect(state.creations[0].assigneeIds).toEqual(["user-two"]);
  } finally {
    state.release();
  }
});

test("refresh does not reopen task editors after returning to the overview", async ({
  page,
}) => {
  const state = await setup(page, "#item-one");
  await expect(page).toHaveURL(/\/tasks\/item-one$/);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  const detail = page.getByTestId("work-item-detail");
  await expect(detail).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  state.change();
  await page.getByRole("button", { name: "Refresh task" }).click();
  await expect(detail).toBeHidden();
  await expect(page.getByRole("heading", { name: "Task brief" })).toBeVisible();
});

test("a failed task refresh preserves its draft, while revoked access removes it", async ({
  page,
}) => {
  await setup(page);
  const detail = await openTaskEditor(page);
  await detail
    .getByLabel("Reason or follow-up note")
    .fill("Keep during reconnect");
  let status = 503;
  await page.route(`**/api/v1/items/${item.id}`, (route) =>
    route.fulfill({
      status,
      json: {
        error: {
          code: "test_failure",
          message: "Test task read failure",
          requestId: "test-task",
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Refresh task" }).click();
  await expect(page.getByRole("button", { name: "Retry refresh" })).toBeVisible(
    { timeout: 10000 },
  );
  await expect(detail.getByLabel("Reason or follow-up note")).toHaveValue(
    "Keep during reconnect",
  );
  status = 403;
  await page.getByRole("button", { name: "Retry refresh" }).click();
  await expect(detail).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Task unavailable" }),
  ).toBeVisible();
});

test("board filters, status columns, and completed work stay connected to saved tasks", async ({
  page,
}) => {
  const state = await setup(page);
  state.setRecords([
    {
      ...item,
      id: "overdue-task",
      title: "Confirm customer scope",
      dueDate: "2020-01-01",
      priority: "urgent",
      assignees: [{ id: "user-one", name: "Owner" }],
    },
    {
      ...item,
      id: "completed-task",
      title: "Ship the completed launch",
      status: "done",
      assignees: [{ id: "user-one", name: "Owner" }],
    },
    {
      ...item,
      id: "undated-task",
      title: "Draft project brief",
      status: "working",
      assignees: [{ id: "user-two", name: "Colleague" }],
    },
  ]);
  await page.getByRole("button", { name: "Refresh test records" }).click();
  const boardView = page.getByTestId("live-board");
  await expect(boardView.getByTestId("work-item-overdue-task")).toBeVisible();
  await boardView.getByRole("button", { name: /^Overdue / }).click();
  await expect(boardView.getByTestId("work-item-completed-task")).toHaveCount(
    0,
  );
  await expect(boardView.getByTestId("work-item-overdue-task")).toBeVisible();
  await boardView.getByRole("button", { name: /^All work / }).click();
  await boardView.getByRole("button", { name: "Board", exact: true }).click();
  await expect(boardView.getByRole("region", { name: /^done/ })).toContainText(
    "Ship the completed launch",
  );
  await expect(
    boardView
      .getByTestId("work-item-undated-task")
      .getByRole("link", { name: "Edit task", exact: true }),
  ).toHaveAttribute("href", "/app/workspaces/launch/tasks/undated-task#edit");
  const taskDetail = await openTaskEditor(page, "undated-task");
  await taskDetail.getByLabel(/^Work status/).selectOption("review");
  await expect(taskDetail.getByLabel(/^Work status/)).toHaveValue("review");
  await page.goto("https://trevv.test/");
  await page.getByRole("button", { name: "Refresh test records" }).click();
  await expect(boardView.getByTestId("work-item-undated-task")).toHaveAttribute(
    "data-version",
    "2",
  );
  await boardView.getByRole("button", { name: "Board", exact: true }).click();
  await expect(
    boardView.getByRole("region", { name: /^review/ }),
  ).toContainText("Draft project brief");
  const myWork = page.getByRole("region", { name: "My tasks" });
  await myWork.getByRole("button", { name: /^Completed / }).click();
  await expect(
    myWork.getByRole("link", { name: /Ship the completed launch/ }),
  ).toHaveAttribute("href", "/app/workspaces/launch/tasks/completed-task");
  await boardView.getByRole("button", { name: "List", exact: true }).click();
  await boardView.getByLabel("Search tasks").fill("brief");
  await expect(boardView.getByTestId("work-item-overdue-task")).toHaveCount(0);
  await expect(boardView.getByTestId("work-item-undated-task")).toBeVisible();
});

test("task edits survive refreshes, remove deadlines, and preserve saved updates", async ({
  page,
}) => {
  const state = await setup(page);
  const detail = await openTaskEditor(page);
  await detail.getByRole("button", { name: "Edit details" }).click();
  await detail.getByLabel("Task title").fill("A clearly owned deliverable");
  await detail
    .getByLabel("Description", { exact: true })
    .fill("Acceptance criteria and next step");
  await detail.getByLabel("Due date", { exact: true }).fill("2026-09-12");
  await detail
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption("high");
  state.change();
  await page
    .getByRole("button", { name: "Refresh task" })
    .click({ force: true });
  await expect(detail.getByLabel("Task title")).toHaveValue(
    "A clearly owned deliverable",
  );
  await expect(
    detail.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await detail
    .getByRole("button", { name: "Use latest version for my draft" })
    .click();
  await detail.getByRole("button", { name: "Save changes" }).click();
  await expect(
    detail.getByRole("heading", { name: "A clearly owned deliverable" }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Edit details" }).click();
  await detail.getByLabel("Due date", { exact: true }).fill("");
  await detail.getByRole("button", { name: "Save changes" }).click();
  await expect(detail.getByText("No due date", { exact: true })).toBeVisible();
  await detail
    .getByLabel("Post an update")
    .fill("Customer approved the scope. Ready for delivery.");
  await detail
    .getByRole("button", { name: "Post update", exact: true })
    .click();
  await expect(detail.getByLabel("Post an update")).toBeEmpty();
  await expect(
    detail.getByRole("region", { name: "Updates and evidence" }),
  ).toContainText("Customer approved the scope.");
  expect(state.transitions[0].version).toBe('"2"');
  expect(state.transitions[1].body.dueDate).toBeNull();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(detail).toBeHidden();
});
