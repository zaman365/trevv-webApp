import { expect, test, type Page } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import { teamWorkspaceApi } from "../fixtures/team-workspace-api";
import { board, item } from "../../apps/web/test-fixtures/live-workflow-data";

async function sprints(page: Page) {
  const api = teamWorkspaceApi();
  api.state.boards[0]!.name = board.name;
  for (const state of ["planned", "active", "completed"] as const) {
    api.state.boards.push({
      ...board,
      id: `sprint-${state}`,
      name: `${state} launch sprint`,
      description: `Deliver the ${state} launch goal`,
      startDate: "2026-09-14",
      endDate: "2026-09-25",
      planning: {
        kind: "sprint",
        state,
        parentBoardId: board.id,
        teamId: "team-launch",
      },
    });
  }
  const records = [
    {
      ...item,
      id: "parent-linked",
      title: "Prepare release",
      status: "blocked" as const,
      planning: { cycleId: "sprint-active" },
    },
    {
      ...item,
      id: "direct",
      title: "Review release",
      boardId: "sprint-active",
      status: "working" as const,
    },
    {
      ...item,
      id: "both",
      title: "Approve release",
      boardId: "sprint-active",
      planning: { cycleId: "sprint-active" },
      status: "done" as const,
    },
    { ...item, id: "backlog", title: "Backlog research" },
    {
      ...item,
      id: "other-sprint",
      title: "Next sprint task",
      planning: { cycleId: "sprint-planned" },
    },
    {
      ...item,
      id: "private",
      title: "Outside workspace",
      workspaceId: "private",
      planning: { cycleId: "sprint-active" },
    },
  ];
  const fixture = await setup(page, "", {
    dashboard: true,
    styled: true,
    records,
    api: api.api,
  });
  await page.getByRole("tab", { name: "Sprints", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Sprint planning",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "active launch sprint", exact: true }),
  ).toBeVisible();
  return { api, fixture, panel };
}

test("sprint filters and work use actual cycle membership, with project backlog kept separate", async ({
  page,
}) => {
  const { panel, fixture } = await sprints(page);
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(6);
  const active = panel.getByRole("article", {
    name: "active launch sprint sprint",
    exact: true,
  });
  await expect(active).toContainText("1 / 3 work items completed");
  await expect(active).toContainText("1 blocked");
  await expect(active.getByRole("progressbar")).toHaveAttribute("max", "3");
  const details = panel.getByRole("region", {
    name: "active launch sprint sprint details",
  });
  await expect(details).toContainText("Prepare release");
  await expect(details).not.toContainText("Backlog research");
  await expect(details).not.toContainText("Next sprint task");
  await expect(panel).not.toContainText("Outside workspace");
  await details.getByRole("button", { name: "List", exact: true }).click();
  await details
    .getByRole("button", {
      name: "Edit status for Prepare release",
      exact: true,
    })
    .click();
  await expect(
    details.getByLabel("Status for Prepare release", { exact: true }),
  ).toBeDisabled();
  await details
    .getByRole("button", {
      name: "Edit status for Review release",
      exact: true,
    })
    .click();
  await details
    .getByLabel("Status for Review release", { exact: true })
    .selectOption("review");
  await expect(details.getByText(/Server confirmed/)).toBeVisible();
  expect(fixture.transitions[0]).toMatchObject({ body: { status: "review" } });
  await details
    .getByRole("button", { name: "Board backlog", exact: true })
    .click();
  await expect(details).toContainText("Backlog research");
  await expect(details).not.toContainText("Prepare release");
  await panel
    .getByRole("group", { name: "Sprint status" })
    .getByRole("button", { name: "Planned 2", exact: true })
    .click();
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(2);
  await expect(
    panel.getByRole("button", { name: "planned launch sprint", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption("team-operations");
  await expect(panel.getByText("No sprints match these filters")).toBeVisible();
  await panel.getByRole("button", { name: "Clear filters" }).click();
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(6);
});

test("sprint cards open their work from the whole card and keep full-page links separate", async ({
  page,
}) => {
  const { panel } = await sprints(page);
  const planned = panel.getByTestId("planning-card-sprint-planned");
  await planned.click({ position: { x: 10, y: 10 } });
  await expect(
    panel.getByRole("region", {
      name: "planned launch sprint sprint details",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    planned.getByRole("link", {
      name: "Open planned launch sprint board",
      exact: true,
    }),
  ).toHaveAttribute("href", "/app/workspaces/launch/boards/sprint-planned");
  const active = panel.getByTestId("planning-card-sprint-active");
  await active
    .getByRole("button", { name: "active launch sprint", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    panel.getByRole("region", {
      name: "active launch sprint sprint details",
      exact: true,
    }),
  ).toBeVisible();
});

test("planning cards stay aligned across teams and expose notes, milestones, editing and card navigation", async ({
  page,
}) => {
  const api = teamWorkspaceApi();
  const first = api.state.boards[0]!;
  const description =
    "Goal: Deliver the launch across both teams.\nScope: A complete campaign with a clear review process.\nSuccess criteria: Publish and measure the results.\nRisks: Review capacity.";
  first.description = description;
  first.startDate = "2026-09-14";
  first.endDate = "2026-09-25";
  const second = api.state.boards[1]!;
  second.description = "Goal:\nScope:\nSuccess criteria:\nMilestones:\nRisks:";
  await setup(page, "", {
    view: "planning",
    styled: true,
    api: api.api,
    records: [{ ...item, type: "milestone", title: "Review the campaign" }],
  });
  await page.goto("https://trevv.test/?view=planning&mode=plans");
  await expect(
    page.getByRole("heading", { name: "Sprints", exact: true, level: 1 }),
  ).toBeVisible();
  const cards = page.locator('[data-testid^="planning-card-"]');
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const boxes = await cards.evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { height: r.height, width: r.width, right: r.right };
      }),
    );
    expect(boxes.length).toBeGreaterThan(1);
    expect(
      Math.max(...boxes.map((b) => b.height)) -
        Math.min(...boxes.map((b) => b.height)),
    ).toBeLessThanOrEqual(1);
    for (const box of boxes) expect(box.right).toBeLessThanOrEqual(width);
  }
  const card = page.getByTestId(`planning-card-${first.id}`);
  await expect(card.getByRole("progressbar")).toHaveAttribute("value", "0");
  await expect(card).toContainText("0%");
  await card.locator("summary").click();
  await expect(
    card.locator("details").getByText(description, { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Review the campaign", exact: true }),
  ).toHaveAttribute(
    "href",
    `/app/workspaces/launch/boards/${item.boardId}#${item.id}`,
  );
  await card.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit plan", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.route(
    `https://trevv.test/app/workspaces/launch/boards/${first.id}`,
    (route) =>
      route.fulfill({ contentType: "text/html", body: "<h1>Plan board</h1>" }),
  );
  await card.click({ position: { x: 10, y: 10 } });
  await expect(
    page.getByRole("heading", { name: "Plan board", exact: true }),
  ).toBeVisible();
});

test("New Sprint persists sprint type, goal, team, parent and required dates; task capture keeps its cycle", async ({
  page,
}) => {
  const { panel, api, fixture } = await sprints(page);
  await panel.getByRole("button", { name: "New Sprint", exact: true }).click();
  let editor = page.getByRole("dialog", { name: "New Sprint", exact: true });
  await expect(editor.getByLabel("Plan type", { exact: true })).toHaveValue(
    "sprint",
  );
  await expect(
    editor.getByLabel("Start date", { exact: true }),
  ).toHaveAttribute("required", "");
  await editor
    .getByLabel("Sprint name", { exact: true })
    .fill("September delivery");
  await editor
    .getByLabel("Goal and success criteria", { exact: true })
    .fill("Ship the launch checklist");
  await editor.getByLabel("Team", { exact: true }).selectOption("team-launch");
  await editor
    .getByLabel("Parent board", { exact: true })
    .selectOption(board.id);
  await editor.getByLabel("Start date", { exact: true }).fill("2026-09-14");
  await editor.getByLabel("Target date", { exact: true }).fill("2026-09-25");
  let failNext = true;
  await page.route("**/api/v1/boards", async (route) => {
    if (route.request().method() === "POST" && failNext) {
      failNext = false;
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "unavailable",
            message: "Retry this save",
            requestId: "sprint-save-retry",
          },
        },
      });
    }
    await route.fallback();
  });
  await editor
    .getByRole("button", { name: "Create sprint", exact: true })
    .click();
  await expect(
    editor.getByText("Retry this save", { exact: true }),
  ).toBeVisible();
  await expect(editor.getByLabel("Sprint name", { exact: true })).toHaveValue(
    "September delivery",
  );
  expect(api.state.plans).toHaveLength(0);
  await editor
    .getByRole("button", { name: "Create sprint", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(api.state.plans[0]).toMatchObject({
    name: "September delivery",
    description: "Ship the launch checklist",
    startDate: "2026-09-14",
    endDate: "2026-09-25",
    planning: {
      kind: "sprint",
      state: "planned",
      teamId: "team-launch",
      parentBoardId: board.id,
    },
  });
  await panel
    .getByRole("button", { name: "Add sprint task", exact: true })
    .click();
  editor = page.getByRole("dialog");
  await editor.getByLabel("Title", { exact: true }).fill("Ship checklist");
  await editor
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(fixture.creations.at(-1)).toMatchObject({
    boardId: board.id,
    planning: { cycleId: "plan-0", teamId: "team-launch" },
    title: "Ship checklist",
  });
  await expect(
    panel.getByRole("link", { name: /^Ship checklist/ }),
  ).toBeVisible();
});

test("starting and completing a sprint saves its lifecycle without completing its tasks", async ({
  page,
}) => {
  const { panel, api, fixture } = await sprints(page);
  await panel
    .getByRole("button", { name: "planned launch sprint", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Start sprint", exact: true })
    .click();
  let editor = page.getByRole("dialog", { name: "Edit sprint", exact: true });
  await expect(editor.getByLabel("State", { exact: true })).toHaveValue(
    "active",
  );
  await editor
    .getByRole("button", { name: "Save sprint", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(
    api.state.boards.find((b) => b.id === "sprint-planned")?.planning?.state,
  ).toBe("active");
  await panel
    .getByRole("button", { name: "Review and complete", exact: true })
    .click();
  editor = page.getByRole("dialog", { name: "Edit sprint", exact: true });
  await expect(
    editor.getByText(/Completing a cycle keeps unfinished tasks visible/),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Save sprint", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(
    api.state.boards.find((b) => b.id === "sprint-planned")?.planning?.state,
  ).toBe("completed");
  await expect(panel.getByText(/Unfinished work stays visible/)).toBeVisible();
  await expect(
    panel.getByRole("link", { name: /^Next sprint task/ }),
  ).toBeVisible();
  expect(fixture.transitions).toHaveLength(0);
});

test("Dashboard and full Sprints keep legacy boards visible and preserve their stored relationships", async ({
  page,
}) => {
  const api = teamWorkspaceApi();
  api.state.boards = api.state.boards.slice(0, 2);
  const first = api.state.boards[0]!;
  const second = api.state.boards[1]!;
  first.name = board.name;
  second.name = "Launch delivery";
  second.planning = {
    kind: "project",
    state: "planned",
    parentBoardId: first.id,
    teamId: "team-operations",
  };
  const original = structuredClone(api.state.boards);
  await setup(page, "", {
    dashboard: true,
    styled: true,
    api: api.api,
    records: [{ ...item, planning: { cycleId: second.id } }],
  });
  await page.getByRole("tab", { name: "Sprints", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Sprint planning",
    exact: true,
  });
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(2);
  await expect(
    panel.getByRole("button", { name: "All sprints 2", exact: true }),
  ).toBeVisible();
  const ids = await panel
    .getByRole("article")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-testid")).sort(),
    );
  await page.goto("https://trevv.test/?view=planning");
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(2);
  expect(
    await panel
      .getByRole("article")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-testid")).sort(),
      ),
  ).toEqual(ids);
  await expect(page.getByText("Project plans", { exact: true })).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "New Sprint", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "Other plans", exact: true }),
  ).toHaveAttribute("href", "/app/workspaces/launch/planning?mode=plans");
  expect(api.state.boards).toEqual(original);
  const card = panel.getByTestId(`planning-card-${second.id}`);
  await expect(card).toContainText("0 / 1 work items completed");
  await card.getByRole("button", { name: "Edit sprint", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit sprint", exact: true });
  await editor
    .getByLabel("Goal and success criteria", { exact: true })
    .fill("Deliver the launch");
  await editor
    .getByRole("button", { name: "Save sprint", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(api.state.boards.find((b) => b.id === second.id)?.planning).toEqual(
    original[1]!.planning,
  );
  await expect(
    panel.getByRole("link", { name: /^Ship the launch/ }),
  ).toBeVisible();
  await page.goto("https://trevv.test/?view=planning&mode=sprints");
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(2);
  await page.reload();
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(2);
  await page.goto("https://trevv.test/?view=planning&mode=plans");
  await expect(
    page.getByRole("button", { name: "New project / plan", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New project / plan", exact: true })
    .click();
  await expect(
    page.getByLabel("Plan type", { exact: true }).getByRole("option"),
  ).toHaveCount(7);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goBack();
  await expect(
    panel.getByRole("button", { name: "New Sprint", exact: true }),
  ).toBeVisible();
});

test("sprint work and milestone previews follow team filters, avoid duplicate tasks and restore their tab", async ({
  page,
}) => {
  const api = teamWorkspaceApi();
  api.state.boards = api.state.boards.slice(0, 2);
  const first = api.state.boards[0]!;
  const second = api.state.boards[1]!;
  await setup(page, "", {
    view: "planning",
    dashboard: true,
    styled: true,
    api: api.api,
    records: [
      {
        ...item,
        id: "milestone-one",
        title: "Launch milestone",
        type: "milestone",
        planning: { cycleId: second.id },
      },
      { ...item, id: "launch-task", title: "Prepare launch" },
      {
        ...item,
        id: "other-task",
        boardId: second.id,
        title: "Operations follow-up",
      },
      {
        ...item,
        id: "private-task",
        workspaceId: "private",
        title: "Outside workspace",
      },
    ],
  });
  const panel = page.getByRole("region", {
    name: "Sprint planning",
    exact: true,
  });
  const tabs = panel.getByRole("tablist", {
    name: "Sprint views",
    exact: true,
  });
  await tabs.getByRole("tab", { name: "Sprint work", exact: true }).click();
  const work = panel.getByRole("tabpanel", {
    name: "Sprint work",
    exact: true,
  });
  await expect(
    work.getByRole("link", { name: /^Launch milestone/ }),
  ).toHaveCount(1);
  await expect(work).toContainText("Prepare launch");
  await expect(work).toContainText("Operations follow-up");
  await expect(work).not.toContainText("Outside workspace");
  await panel
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption(first.planning!.teamId!);
  await expect(work).not.toContainText("Operations follow-up");
  await tabs.getByRole("tab", { name: "Milestones", exact: true }).click();
  const milestones = panel.getByRole("tabpanel", {
    name: "Milestones",
    exact: true,
  });
  await expect(milestones).toContainText("Launch milestone");
  await expect(milestones).not.toContainText("Prepare launch");
  await expect(page).toHaveURL(/sprintView=milestones/);
  await page.reload();
  await expect(
    tabs.getByRole("tab", { name: "Milestones", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    milestones.getByRole("link", { name: /^Launch milestone/ }),
  ).toHaveCount(1);
  await tabs.getByRole("tab", { name: "Milestones", exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(
    tabs.getByRole("tab", { name: "Overview", exact: true }),
  ).toBeFocused();
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(2);
});

test("sprint layout fits a narrow screen and board permission loss clears details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { panel } = await sprints(page);
  await expect(
    panel.getByRole("button", { name: "New Sprint", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("trevv-sprints-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: test.info().outputPath("trevv-sprints-desktop.png"),
    fullPage: true,
  });
  await page.route("**/api/v1/boards?**", (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: "forbidden", message: "Access removed" } },
    }),
  );
  await panel
    .getByRole("button", { name: "Refresh sprints", exact: true })
    .click();
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "New Sprint", exact: true }),
  ).toHaveCount(0);
});
