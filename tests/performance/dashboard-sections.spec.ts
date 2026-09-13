import { expect, test, type Page } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import { teamWorkspaceApi } from "../fixtures/team-workspace-api";
import { board, item } from "../../apps/web/test-fixtures/live-workflow-data";
import { issueSignals } from "../../apps/web/test-fixtures/attention-workspace-data";
import { dashboardSections } from "../../apps/web/lib/dashboard-sections";

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

test("every top tab updates the dashboard in place and offers the correct full page", async ({
  page,
}) => {
  await dashboard(page);
  const tabs = page.getByRole("tablist", { name: "Dashboard sections" });
  await expect(tabs.getByRole("tab")).toHaveCount(11);
  for (const section of dashboardSections) {
    await tabs.getByRole("tab", { name: section.label, exact: true }).click();
    const panel = page.getByRole("tabpanel", {
      name: section.label,
      exact: true,
    });
    await expect(panel).toBeVisible();
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await expect(
      panel.getByRole("link", {
        name: `Open ${section.title} full page`,
        exact: true,
      }),
    ).toHaveAttribute("href", `/app/workspaces/launch/${section.view}`);
    await expect(
      tabs.getByRole("tab", { name: section.label, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("main")).toHaveCount(1);
    if (section.id === "teams")
      await expect(panel.getByTestId("team-card-team-launch")).toBeVisible();
    if (section.id === "messages")
      await expect(
        panel.getByRole("textbox", { name: "Message", exact: true }),
      ).toBeEnabled();
    if (section.id === "planning")
      await expect(
        panel.getByRole("region", { name: "Project planning", exact: true }),
      ).toBeVisible();
    if (section.id === "inbox")
      await expect(
        panel.getByRole("tab", { name: /Captured work/ }),
      ).toBeVisible();
    if (section.id === "attention")
      await expect(
        panel.getByRole("heading", { name: "Open signals" }),
      ).toBeVisible();
  }
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

test("team and project management remain available inside dashboard panels", async ({
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
  await tabs.getByRole("tab", { name: "Projects", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Project planning", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New project / plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Messages keep a draft across tabs and send within the dashboard", async ({
  page,
}) => {
  const api = await dashboard(page);
  const tabs = page.getByRole("tablist", { name: "Dashboard sections" });
  await tabs.getByRole("tab", { name: "Messages", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Messages", exact: true });
  await panel.getByRole("button", { name: /Launch team/ }).click();
  const composer = panel.getByRole("textbox", { name: "Message" });
  await composer.fill("Keep the launch discussion here");
  await tabs.getByRole("tab", { name: "My Work", exact: true }).click();
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
      tabs.getByRole("tab", { name: "My Work", exact: true }),
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
