import { expect, test, type Page } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import { teamWorkspaceApi } from "../fixtures/team-workspace-api";
import { board, item } from "../../apps/web/test-fixtures/live-workflow-data";
import { issueSignals } from "../../apps/web/test-fixtures/attention-workspace-data";
import { dashboardNavigationSections } from "../../apps/web/lib/dashboard-sections";

async function dashboard(page: Page) {
  const api = teamWorkspaceApi();
  api.state.boards[0]!.name = board.name;
  const state = await setup(page, "", {
    dashboard: true,
    styled: true,
    attention: issueSignals,
    records: [
      { ...item, assignees: [{ id: "user-one", name: "Owner" }] },
      {
        ...item,
        id: "decision-one",
        type: "decision",
        decisionState: "needed",
        title: "Choose a launch date",
      },
      {
        ...item,
        id: "approval-one",
        type: "approval",
        approvalState: "pending",
        title: "Approve the brief",
      },
      {
        ...item,
        workspaceId: "another-workspace",
        id: "outside-work",
        title: "Outside this workspace",
        assignees: [{ id: "user-one", name: "Owner" }],
      },
    ],
    api: api.api,
  });
  return { ...api, ...state };
}

test("summary cards align within the available page width and keep long lists accessible", async ({
  page,
}, testInfo) => {
  const api = teamWorkspaceApi();
  api.state.boards[0]!.name = board.name;
  for (let index = 0; index < 6; index++) {
    api.state.boards.push({
      ...board,
      id: `extra-plan-${index}`,
      name: `Upcoming delivery plan ${index + 1}`,
    });
  }
  await setup(page, "", {
    dashboard: true,
    styled: true,
    api: api.api,
    records: Array.from({ length: 8 }, (_, index) => ({
      ...item,
      id: `work-${index}`,
      assignees: [{ id: `person-${index}`, name: `Teammate ${index + 1}` }],
    })),
  });
  const status = page.getByRole("region", {
    name: "Work by status",
    exact: true,
  });
  const deadlines = page.getByRole("region", {
    name: "Upcoming deadlines",
    exact: true,
  });
  const projects = page.getByRole("region", {
    name: "Project progress",
    exact: true,
  });
  const workload = page.getByRole("region", {
    name: "Workload by person",
    exact: true,
  });
  for (const size of [
    { width: 1440, sidebar: 248, columns: 2 },
    { width: 1100, sidebar: 248, columns: 2 },
    { width: 1024, sidebar: 248, columns: 2 },
    { width: 1000, sidebar: 248, columns: 1 },
    { width: 768, sidebar: 0, columns: 2 },
    { width: 740, sidebar: 0, columns: 1 },
    { width: 390, sidebar: 0, columns: 1 },
  ]) {
    await page.setViewportSize({ width: size.width, height: 900 });
    await page.locator("main").evaluate((element, margin) => {
      element.style.marginLeft = `${margin}px`;
      element.style.width = `calc(100% - ${margin}px)`;
    }, size.sidebar);
    const [a, b, c, d] = await Promise.all([
      status.boundingBox(),
      deadlines.boundingBox(),
      projects.boundingBox(),
      workload.boundingBox(),
    ]);
    if (size.columns === 2) {
      expect(a!.y).toBe(b!.y);
      expect(a!.height).toBe(b!.height);
      expect(c!.y).toBe(d!.y);
      expect(c!.height).toBe(d!.height);
      expect(a!.height).toBeLessThan(350);
      expect(c!.height).toBeLessThan(400);
    } else {
      expect(b!.y).toBeGreaterThan(a!.y + a!.height);
      expect(
        await projects
          .getByRole("region", { name: "Project progress list" })
          .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
      ).toBe(true);
    }
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 5)
        .map((el) => ({
          tag: el.tagName,
          className: el.className,
          right: el.getBoundingClientRect().right,
        })),
    );
    expect(overflow, `Viewport ${size.width}`).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("main").evaluate((el) => {
    el.style.marginLeft = "248px";
    el.style.width = "calc(100% - 248px)";
  });
  const plans = projects.getByRole("region", { name: "Project progress list" });
  await expect(plans.getByRole("link")).toHaveCount(6);
  await projects.getByRole("button", { name: "Show all 9 plans" }).click();
  await expect(plans.getByRole("link")).toHaveCount(9);
  await plans.getByRole("link").last().focus();
  expect(await plans.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await workload.getByRole("button", { name: "Show all 8 people" }).click();
  const people = workload.getByRole("region", { name: "People workload list" });
  await expect(people.getByRole("button")).toHaveCount(8);
  await people.getByRole("button").last().focus();
  expect(await people.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await status.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("balanced-dashboard.png"),
  });
  await people.getByRole("button").last().click();
  await expect(page.locator("#dashboard-source-work")).toContainText(
    "Teammate 8",
  );
});

test("every top tab updates the dashboard in place and offers the correct full page", async ({
  page,
}) => {
  await dashboard(page);
  const tabs = page.getByRole("tablist", { name: "Dashboard sections" });
  await expect(tabs.getByRole("tab")).toHaveCount(10);
  await expect(
    tabs.getByRole("tab", { name: /^(Messages|Inbox)$/ }),
  ).toHaveCount(0);
  for (const section of dashboardNavigationSections) {
    await tabs.getByRole("tab", { name: section.label, exact: true }).click();
    const panel = page.getByRole("tabpanel", {
      name: section.label,
      exact: true,
    });
    await expect(panel).toBeVisible();
    await expect(page.getByRole("tabpanel")).toHaveCount(
      ["my-work", "planning", "report-log"].includes(section.id) ? 2 : 1,
    );
    await expect(
      panel.getByRole("link", {
        name: `Open ${section.title} full page`,
        exact: true,
      }),
    ).toHaveAttribute(
      "href",
      `/app/workspaces/launch/${section.view}${section.id === "planning" ? "?mode=sprints" : ""}`,
    );
    await expect(
      tabs.getByRole("tab", { name: section.label, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("main")).toHaveCount(1);
    if (section.id === "teams")
      await expect(panel.getByTestId("team-card-team-launch")).toBeVisible();
    if (section.id === "planning")
      await expect(
        panel.getByRole("region", { name: "Sprint planning", exact: true }),
      ).toBeVisible();
    if (section.id === "attention")
      await expect(
        panel.getByRole("heading", { name: "Open signals" }),
      ).toBeVisible();
  }
});

test("embedded My Work tabs preserve Dashboard context, filters and keyboard navigation", async ({
  page,
}) => {
  await dashboard(page);
  const outer = page.getByRole("tablist", { name: "Dashboard sections" });
  await outer.getByRole("tab", { name: "My Work", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "My Work sections" });
  const search = page
    .getByRole("tabpanel", { name: "Tasks", exact: true })
    .getByRole("searchbox", { name: "Search tasks", exact: true });
  await search.fill("Ship the launch");
  await tabs
    .getByRole("tab", { name: "Tasks", exact: true })
    .press("ArrowRight");
  await expect(
    tabs.getByRole("tab", { name: "Decisions", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Choose a launch date" }),
  ).toBeVisible();
  const draft = page.getByRole("textbox", { name: "Rationale", exact: true });
  await draft.fill("Review with the launch team");
  await tabs.getByRole("tab", { name: "Approvals", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Approve the brief" }),
  ).toBeVisible();
  await tabs.getByRole("tab", { name: "Waiting", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("section")).toBe("my-work");
  expect(new URL(page.url()).searchParams.get("workSection")).toBe("waiting");
  await outer.getByRole("tab", { name: "Summary", exact: true }).click();
  await outer.getByRole("tab", { name: "My Work", exact: true }).click();
  await expect(
    tabs.getByRole("tab", { name: "Waiting", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "Decisions", exact: true }).click();
  await expect(draft).toHaveValue("Review with the launch team");
  await tabs.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(search).toHaveValue("Ship the launch");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of await tabs.getByRole("tab").all()) {
    const box = (await tab.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await tabs.getByRole("tab", { name: "Waiting", exact: true }).click();
  await page.reload();
  await expect(
    outer.getByRole("tab", { name: "My Work", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    tabs.getByRole("tab", { name: "Waiting", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("Summary and My Work keep independent filters and existing inline updates", async ({
  page,
}) => {
  const state = await dashboard(page);
  const tabs = page.getByRole("tablist", { name: "Dashboard sections" });
  await page
    .getByLabel("Dashboard people", { exact: true })
    .selectOption("mine");
  await page.getByLabel("Dashboard deadline window").selectOption("30");
  await tabs.getByRole("tab", { name: "My Work", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "My Work", exact: true });
  await expect(
    panel.getByRole("link", { name: /Ship the launch/ }),
  ).toBeVisible();
  await expect(panel).not.toContainText("Outside this workspace");
  await panel
    .getByPlaceholder("Search tasks, people, or workspace…")
    .fill("Ship the launch");
  await panel
    .getByLabel("Status for Ship the launch", { exact: true })
    .selectOption("working");
  await expect(panel).toContainText("Server confirmed");
  await tabs.getByRole("tab", { name: "Summary", exact: true }).click();
  await expect(
    page.getByLabel("Dashboard people", { exact: true }),
  ).toHaveValue("mine");
  await expect(page.getByLabel("Dashboard deadline window")).toHaveValue("30");
  await tabs.getByRole("tab", { name: "My Work", exact: true }).click();
  await expect(
    panel.getByPlaceholder("Search tasks, people, or workspace…"),
  ).toHaveValue("Ship the launch");
  expect(state.transitions[0]).toMatchObject({ body: { status: "working" } });
});

test("team and sprint management remain available inside dashboard panels", async ({
  page,
}) => {
  await dashboard(page);
  const tabs = page.getByRole("tablist", { name: "Dashboard sections" });
  await tabs
    .getByRole("tab", { name: "Teams and people", exact: true })
    .click();
  const panel = page.getByRole("tabpanel", {
    name: "Teams and people",
    exact: true,
  });
  await expect(panel.getByTestId("team-card-team-launch")).toBeVisible();
  await panel
    .getByRole("button", { name: "Manage Launch team", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await tabs.getByRole("tab", { name: "Sprints", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Sprint planning", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New Sprint", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Messages keep drafts and sending on their own page after leaving Dashboard navigation", async ({
  page,
}) => {
  const api = teamWorkspaceApi();
  await setup(page, "", { view: "messages", api: api.api });
  const tabs = page.getByRole("tablist", { name: "Messages sections" });
  const panel = page.getByTestId("live-messages");
  await panel.getByRole("button", { name: /Launch team/ }).click();
  const composer = panel.getByRole("textbox", { name: "Message" });
  await composer.fill("Keep the launch discussion here");
  await tabs.getByRole("tab", { name: "People", exact: true }).click();
  await tabs.getByRole("tab", { name: "Messages", exact: true }).click();
  await expect(composer).toHaveValue("Keep the launch discussion here");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(composer).toHaveValue("");
  await expect(
    panel.getByText("Keep the launch discussion here", { exact: true }),
  ).toBeVisible();
  expect(api.state.messages.at(-1)?.body).toBe(
    "Keep the launch discussion here",
  );
});

test("Decisions and approvals preserve their own editable outcomes", async ({
  page,
}) => {
  await dashboard(page);
  const tabs = page.getByRole("tablist", { name: "Dashboard sections" });
  await tabs.getByRole("tab", { name: "Decisions", exact: true }).click();
  const decision = page.getByRole("tabpanel", {
    name: "Decisions",
    exact: true,
  });
  await expect(
    decision.getByRole("heading", { name: "Choose a launch date" }),
  ).toBeVisible();
  await decision.getByLabel("Rationale").fill("Agree the date with the team");
  await tabs.getByRole("tab", { name: "Approvals", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Approve the brief" }),
  ).toBeVisible();
  await tabs.getByRole("tab", { name: "Decisions", exact: true }).click();
  await expect(decision.getByLabel("Rationale")).toHaveValue(
    "Agree the date with the team",
  );
});

test("operational shortcuts select a dashboard section, while reload and Back restore tabs", async ({
  page,
}) => {
  await dashboard(page);
  await page
    .getByRole("navigation", { name: "Operating loop views" })
    .getByRole("button", { name: /Attention/ })
    .click();
  await expect(
    page.getByRole("tabpanel", { name: "Attention", exact: true }),
  ).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Dashboard sections" });
  await tabs
    .getByRole("tab", { name: "Teams and people", exact: true })
    .click();
  await page.goBack();
  await expect(
    tabs.getByRole("tab", { name: "Attention", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(
    tabs.getByRole("tab", { name: "Teams and people", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(
    page.getByRole("tabpanel", { name: "Teams and people", exact: true }),
  ).toBeVisible();
});

test("the full Messages page retains its standalone layout and conversation tools", async ({
  page,
}) => {
  const api = teamWorkspaceApi();
  await setup(page, "", { view: "messages", api: api.api });
  await expect(
    page.getByRole("heading", { name: "Messages", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Open conversation context" }).click();
  await expect(
    page.getByRole("dialog", { name: /Launch team context/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeEnabled();
});

test("opening Attention details keeps the user inside the selected dashboard section", async ({
  page,
}) => {
  await dashboard(page);
  await page
    .getByRole("tablist", { name: "Dashboard sections" })
    .getByRole("tab", { name: "Attention", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Ship the launch is overdue/ })
    .click();
  await expect(page.getByTestId("issue-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("tabpanel", { name: "Attention", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("section")).toBe("attention");
});

for (const theme of ["light", "dark"]) {
  test(`dashboard sections support keyboard and mobile navigation in ${theme}`, async ({
    page,
  }, testInfo) => {
    await dashboard(page);
    await page.evaluate(
      (value) => document.documentElement.setAttribute("data-theme", value),
      theme,
    );
    const tabs = page.getByRole("tablist", { name: "Dashboard sections" });
    await page.screenshot({
      path: testInfo.outputPath("dashboard-desktop.png"),
    });
    await tabs.getByRole("tab", { name: "Summary", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      tabs.getByRole("tab", { name: "Attention", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("tabpanel", { name: "Waiting", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await tabs
      .getByRole("tab", { name: "Teams and people", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Open Teams and people full page" }),
    ).toBeVisible();
    await expect(page.getByTestId("team-card-team-launch")).toBeVisible();
    await expect(page.getByTestId("live-dashboard")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("dashboard-mobile.png"),
    });
    await tabs
      .getByRole("tab", { name: "Teams and people", exact: true })
      .focus();
    await page.keyboard.press("Home");
    await expect(
      tabs.getByRole("tab", { name: "Summary", exact: true }),
    ).toBeFocused();
  });
}

test("the on-demand plan editor retains dismissed drafts and creates the original plan", async ({
  page,
}) => {
  const api = await dashboard(page);
  const open = page.getByTestId("create-board-open");
  await open.click();
  const dialog = page.getByTestId("create-board-dialog");
  await dialog
    .getByLabel("Plan name", { exact: true })
    .fill("Coordinate the launch");
  await dialog
    .getByLabel("Description · Optional", { exact: true })
    .fill("Keep owners and dates together");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await open.click();
  await expect(dialog.getByLabel("Plan name", { exact: true })).toHaveValue(
    "Coordinate the launch",
  );
  await dialog
    .getByRole("button", { name: "Create plan", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Server confirmed “Coordinate the launch”", { exact: true }),
  ).toBeVisible();
  expect(api.state.plans.at(-1)).toMatchObject({
    name: "Coordinate the launch",
    description: "Keep owners and dates together",
    visibility: "private",
  });
});
