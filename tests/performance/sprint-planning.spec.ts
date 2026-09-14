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
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(3);
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
  await expect(
    details.getByLabel("Status for Prepare release", { exact: true }),
  ).toBeDisabled();
  await details
    .getByLabel("Status for Review release", { exact: true })
    .selectOption("review");
  await expect(details.getByText(/Server confirmed/)).toBeVisible();
  expect(fixture.transitions[0]).toMatchObject({ body: { status: "review" } });
  await details
    .getByRole("button", { name: "Project backlog", exact: true })
    .click();
  await expect(details).toContainText("Backlog research");
  await expect(details).not.toContainText("Prepare release");
  await panel
    .getByRole("group", { name: "Sprint status" })
    .getByRole("button", { name: "Planned 1", exact: true })
    .click();
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(1);
  await expect(
    panel.getByRole("button", { name: "planned launch sprint", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption("team-operations");
  await expect(panel.getByText("No sprints match these filters")).toBeVisible();
  await panel.getByRole("button", { name: "Clear filters" }).click();
  await expect(panel.getByRole("article", { name: / sprint$/ })).toHaveCount(3);
});

test("Plan sprint persists sprint type, goal, team, parent and required dates; task capture keeps its cycle", async ({
  page,
}) => {
  const { panel, api, fixture } = await sprints(page);
  await panel.getByRole("button", { name: "Plan sprint", exact: true }).click();
  let editor = page.getByRole("dialog", { name: "Plan sprint", exact: true });
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
    .getByLabel("Parent project", { exact: true })
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

test("full sprint page restores its mode and keeps generic project management reachable", async ({
  page,
}) => {
  const api = teamWorkspaceApi();
  await setup(page, "", { view: "planning", api: api.api });
  await expect(
    page.getByRole("button", { name: "New project / plan", exact: true }),
  ).toBeVisible();
  await page.goto("https://trevv.test/?view=planning&mode=sprints");
  await expect(
    page.getByRole("heading", { name: "Sprints", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("tablist", { name: "Sprints sections", exact: true })
      .getByRole("tab", { name: "Sprints", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText("Plan your first sprint", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Projects and other plans" }),
  ).toHaveAttribute("href", "/app/workspaces/launch/planning");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sprints", exact: true, level: 1 }),
  ).toBeVisible();
  await page.evaluate(() => {
    history.pushState(null, "", "/?view=planning");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("button", { name: "New project / plan", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Sprints", exact: true, level: 1 }),
  ).toBeVisible();
});

test("sprint layout fits a narrow screen and board permission loss clears details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { panel } = await sprints(page);
  await expect(
    panel.getByRole("button", { name: "Plan sprint", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/trevv-sprints-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "/private/tmp/trevv-sprints-desktop.png",
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
    panel.getByRole("button", { name: "Plan sprint", exact: true }),
  ).toHaveCount(0);
});
