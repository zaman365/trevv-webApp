import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "../fixtures/live-workflow-browser";
import { teamWorkspaceApi } from "../fixtures/team-workspace-api";
import {
  teamItems,
  teamConversation,
} from "../../apps/web/test-fixtures/team-workspace-data";

async function start(page: Page, hash = "") {
  const fixture = teamWorkspaceApi();
  const work = await setup(page, hash, {
    view: "team",
    api: fixture.api,
    records: structuredClone(teamItems),
  });
  return { ...fixture, work };
}
const section = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Team page sections" })
    .getByRole("link", { name, exact: true });

test("full team page scopes progress and work, opens task details, and preserves section history", async ({
  page,
}) => {
  await start(page);
  await expect(
    page.getByRole("heading", { name: "Launch team", exact: true }),
  ).toBeVisible();
  const progress = page.getByRole("region", { name: "Team progress" });
  await expect(
    progress.getByRole("button", { name: "Open work 4 View details" }),
  ).toBeVisible();
  await expect(
    progress.getByRole("button", { name: "Completed 1 View details" }),
  ).toBeVisible();
  await expect(
    page.getByText("Other team private plan", { exact: true }),
  ).toHaveCount(0);
  await progress
    .getByRole("button", { name: "Overdue 1 View details" })
    .click();
  await expect(page).toHaveURL(/#tasks$/);
  const work = page.getByRole("region", { name: "Team work", exact: true });
  await expect(
    work.getByRole("button", { name: /Review launch brief/ }),
  ).toBeVisible();
  await expect(
    work.getByRole("button", { name: /Unblock creative review/ }),
  ).toHaveCount(0);
  await work.getByRole("button", { name: /Review launch brief/ }).click();
  const detail = page.getByTestId("work-item-detail");
  await expect(
    detail.getByRole("heading", { name: "Review launch brief", exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Edit details" }).click();
  await detail.getByLabel("Task title").fill("Approve launch brief");
  await detail.getByRole("button", { name: "Save changes" }).click();
  await expect(
    detail.getByRole("heading", { name: "Approve launch brief", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await section(page, "Projects & milestones").click();
  await expect(page).toHaveURL(/#projects$/);
  await page.goBack();
  await expect(section(page, "Tasks")).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(section(page, "Projects & milestones")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.reload();
  await expect(section(page, "Projects & milestones")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("link", { name: "Launch campaign", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Operations project", exact: true }),
  ).toHaveCount(0);
});

test("team task creation keeps team scope, recovers drafts and creates milestones", async ({
  page,
}) => {
  const { work } = await start(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "trevv:live-draft:v1:org-one:user-one:quick-capture%3Aworkspace-one",
      "general-draft-untouched",
    ),
  );
  await page.getByRole("button", { name: "New task", exact: true }).click();
  let capture = page.getByTestId("live-quick-capture");
  await expect(capture.getByLabel("Destination board")).toHaveValue(
    "board-one",
  );
  await expect(
    capture
      .getByLabel("Destination board")
      .locator('option[value="board-other"]'),
  ).toHaveCount(0);
  await capture.getByTestId("live-capture-title").fill("New team deliverable");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  capture = page.getByTestId("live-quick-capture");
  await expect(capture.getByTestId("live-capture-title")).toHaveValue(
    "New team deliverable",
  );
  await capture
    .getByText("Planning and Launch team context", { exact: true })
    .click();
  await expect(capture.getByLabel("Responsible team")).toHaveValue(
    "team-launch",
  );
  await capture.getByLabel("Destination board").selectOption("board-shared");
  await expect(capture.getByLabel("Responsible team")).toHaveValue(
    "team-launch",
  );
  await capture.getByTestId("live-capture-submit").click();
  await expect(
    page
      .getByTestId("work-item-detail")
      .getByRole("heading", { name: "New team deliverable", exact: true }),
  ).toBeVisible();
  expect(work.creations[0]).toMatchObject({
    planning: { teamId: "team-launch" },
    boardId: "board-shared",
  });
  expect(
    await page.evaluate(() =>
      localStorage.getItem(
        "trevv:live-draft:v1:org-one:user-one:quick-capture%3Aworkspace-one",
      ),
    ),
  ).toBe("general-draft-untouched");
  await page.keyboard.press("Escape");
  await section(page, "Projects & milestones").click();
  await page.getByRole("button", { name: "Add milestone" }).click();
  await expect(
    capture.getByRole("tab", { name: "Other items" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(capture.getByRole("radio", { name: /Milestone/ })).toBeChecked();
  await capture
    .getByTestId("live-capture-title")
    .fill("Launch approval checkpoint");
  await capture.getByTestId("live-capture-submit").click();
  await expect(
    page.getByTestId("work-item-detail").getByRole("heading", {
      name: "Launch approval checkpoint",
      exact: true,
    }),
  ).toBeVisible();
  expect(work.creations[1]).toMatchObject({
    type: "milestone",
    planning: { teamId: "team-launch" },
  });
});

test("team projects and sprints save their team, dates and parent project", async ({
  page,
}) => {
  const { state } = await start(page, "#projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Create a project or delivery cycle",
  });
  await editor.getByLabel("Plan name").fill("Launch execution");
  await editor
    .getByLabel("Goal and success criteria")
    .fill("Deliver the new campaign.");
  await editor.getByLabel("Start date").fill("2026-09-14");
  await editor.getByLabel("Target date").fill("2026-09-30");
  await editor
    .getByRole("button", { name: "Create plan", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(state.plans[0]).toMatchObject({
    name: "Launch execution",
    planning: { teamId: "team-launch", kind: "project" },
    startDate: "2026-09-14",
    endDate: "2026-09-30",
  });
  await expect(
    page.getByRole("link", { name: "Launch execution", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan a sprint / cycle" }).click();
  await expect(editor.getByLabel("Parent project")).toHaveValue("board-one");
  await expect(editor.getByLabel("Plan type")).toHaveValue("sprint");
  await editor.getByLabel("Plan name").fill("Launch sprint one");
  await editor.getByLabel("Start date").fill("2026-09-14");
  await editor.getByLabel("Target date").fill("2026-09-21");
  await editor
    .getByRole("button", { name: "Create plan", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(state.plans[1]).toMatchObject({
    planning: {
      teamId: "team-launch",
      parentBoardId: "board-one",
      kind: "sprint",
    },
  });
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("link", { name: "Launch execution", exact: true }),
    })
    .getByRole("button", { name: "Edit project", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit plan", exact: true });
  await edit
    .getByLabel("Goal and success criteria")
    .fill("Deliver the campaign and publish the results.");
  await edit.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(
    page.getByText("Deliver the campaign and publish the results.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("team conversation sends and replies safely, retains drafts and supports topics", async ({
  page,
}) => {
  const { state } = await start(page, "#communication");
  const communication = page.getByRole("region", {
    name: "Team communication workspace",
  });
  await expect(
    communication.getByText("The launch brief is ready for review.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.messageKeys).toHaveLength(0);
  await communication
    .getByLabel("Message your team")
    .fill("General update draft");
  await section(page, "Overview").click();
  await section(page, "Communication").click();
  await expect(communication.getByLabel("Message your team")).toHaveValue(
    "General update draft",
  );
  await page.reload();
  await expect(communication.getByLabel("Message your team")).toHaveValue(
    "General update draft",
  );
  state.failNextMessage = true;
  await communication
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    communication.getByText("Please retry", { exact: true }),
  ).toBeVisible();
  await expect(communication.getByLabel("Message your team")).toHaveValue(
    "General update draft",
  );
  await communication
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(communication.getByText("Your message was sent.")).toBeVisible();
  expect(state.messageKeys[1]).toBe(state.messageKeys[0]);
  await communication
    .getByRole("button", { name: "Replies to Teammate", exact: true })
    .click();
  await communication
    .getByLabel("Reply to conversation")
    .fill("Reviewed and approved.");
  await communication
    .getByRole("button", { name: "Send reply", exact: true })
    .click();
  await expect(
    communication
      .getByRole("region", { name: "Message replies" })
      .getByText("Reviewed and approved."),
  ).toBeVisible();
  expect(state.messages.at(-1)?.parentMessageId).toBe("message-one");
  await communication
    .getByRole("button", { name: "Close message replies" })
    .click();
  await communication.getByRole("button", { name: "Mark as read" }).click();
  await expect(
    communication.getByText("Team conversation marked as read."),
  ).toBeVisible();
  await communication
    .getByRole("button", { name: "Topics and discussions", exact: true })
    .click();
  await communication.getByLabel("Topic title").fill("Launch feedback");
  await communication
    .getByLabel("Context or question")
    .fill("Share the final feedback here.");
  await communication
    .getByRole("button", { name: "Create topic", exact: true })
    .click();
  await expect(
    communication.getByRole("region", { name: "Topic discussion" }),
  ).toContainText("Launch feedback");
  await communication.getByLabel("Reply to topic").fill("Ready to deliver.");
  await communication
    .getByRole("button", { name: "Send reply", exact: true })
    .click();
  await expect(
    communication.getByRole("region", { name: "Topic discussion" }),
  ).toContainText("Ready to deliver.");
  await section(page, "Overview").click();
  await page
    .getByRole("button", { name: "Open conversation", exact: true })
    .click();
  await expect(
    communication.getByRole("button", {
      name: "Team conversation",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await section(page, "Overview").click();
  await page
    .getByRole("button", { name: "Browse team topics", exact: true })
    .click();
  await expect(
    communication.getByRole("button", {
      name: "Topics and discussions",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("team people and settings preserve role controls, workload and unsaved profile edits", async ({
  page,
}) => {
  const { state } = await start(page, "#people");
  await page.getByRole("button", { name: "View work for Teammate" }).click();
  await expect(
    page.getByRole("heading", { name: "Teammate's team work", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Team work", exact: true }),
  ).toContainText("Unblock creative review");
  await section(page, "People & workload").click();
  await page.getByLabel("Teammate Team role").selectOption("lead");
  await expect(page.getByLabel("Teammate Team role")).toHaveValue("lead");
  await page
    .getByRole("button", { name: "Remove Teammate from Launch team" })
    .click();
  await expect(page.getByLabel("Teammate Team role")).toHaveCount(0);
  await page.getByLabel("Add an existing person").selectOption("user-two");
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(page.getByLabel("Teammate Team role")).toHaveValue("member");
  expect(state.memberWrites).toEqual([
    "PUT:user-two",
    "DELETE:user-two",
    "PUT:user-two",
  ]);
  await page.getByLabel("Find a team member").fill("teammate");
  await expect(page.getByLabel("Owner Team role")).toHaveCount(0);
  await section(page, "Settings").click();
  await page.getByLabel("Name", { exact: true }).fill("Creative launch team");
  await section(page, "Overview").click();
  await section(page, "Settings").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Creative launch team",
  );
  await page.getByRole("button", { name: "Save Team profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Creative launch team", exact: true }),
  ).toBeVisible();
});

test("team member messages reuse the existing private conversation", async ({
  page,
}) => {
  const fixture = teamWorkspaceApi();
  fixture.state.conversations.push({
    ...teamConversation,
    id: "direct-existing",
    kind: "direct",
  });
  await setup(page, "#people", {
    view: "team",
    api: fixture.api,
    records: structuredClone(teamItems),
  });
  await page.route(
    "https://trevv.test/app/workspaces/launch/messages",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Direct conversation</h1>",
      }),
  );
  await page
    .getByRole("button", { name: "Message Teammate", exact: true })
    .click();
  await expect(page).toHaveURL(
    "https://trevv.test/app/workspaces/launch/messages#direct-existing",
  );
  expect(fixture.state.conversationCreates).toBe(0);
});

test("team page keeps private rooms restricted and removes content after access loss", async ({
  page,
}) => {
  const fixture = teamWorkspaceApi();
  await setup(page, "#communication", {
    view: "team",
    teamId: "team-private",
    api: fixture.api,
  });
  await expect(
    page.getByText("This team room is private", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Message your team")).toHaveCount(0);
  await section(page, "Settings").click();
  await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
  fixture.state.denied = true;
  await expect(page.getByTestId("live-team-page")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "New task", exact: true }),
  ).toHaveCount(0);
});

test("opening a new direct conversation does not send a message", async ({
  page,
}) => {
  const fixture = await start(page, "#people");
  await page.route(
    "https://trevv.test/app/workspaces/launch/messages",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Direct conversation</h1>",
      }),
  );
  await page
    .getByRole("button", { name: "Message Teammate", exact: true })
    .click();
  await expect(page).toHaveURL(
    "https://trevv.test/app/workspaces/launch/messages#direct-new",
  );
  expect(fixture.state.conversationCreates).toBe(1);
  expect(fixture.state.conversations.at(-1)).toMatchObject({
    kind: "direct",
    visibility: "private",
    participants: expect.arrayContaining([
      expect.objectContaining({
        user: expect.objectContaining({ id: "user-one" }),
      }),
      expect.objectContaining({
        user: expect.objectContaining({ id: "user-two" }),
      }),
    ]),
  });
  expect(fixture.state.messageKeys).toHaveLength(0);
});

test("mobile creation forms keep actions visible and restore keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await start(page);
  const taskButton = page.getByRole("button", {
    name: "New task",
    exact: true,
  });
  await taskButton.click();
  const capture = page.getByTestId("live-quick-capture");
  await capture.getByTestId("live-capture-title").fill("Mobile team task");
  await capture
    .getByText("Planning and Launch team context", { exact: true })
    .click();
  await expect(capture.getByTestId("live-capture-submit")).toBeInViewport();
  await capture.getByRole("button", { name: "Close capture" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(capture.getByTestId("live-capture-submit")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(taskButton).toBeFocused();
  const projectButton = page.getByRole("button", {
    name: "New project",
    exact: true,
  });
  await projectButton.click();
  const editor = page.getByRole("dialog", {
    name: "Create a project or delivery cycle",
  });
  await editor.getByLabel("Plan name").fill("Mobile plan");
  await expect(
    editor.getByRole("button", { name: "Create plan", exact: true }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(projectButton).toBeFocused();
});

for (const theme of ["light", "dark"] as const)
  test(`team page supports desktop and mobile in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await start(page);
    await expect(
      page
        .getByRole("region", { name: "Team progress" })
        .getByRole("button", { name: "Open work 4 View details" }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("team-overview-desktop.png"),
      fullPage: true,
    });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const name of [
        "Overview",
        "Tasks",
        "Projects & milestones",
        "Communication",
        "People & workload",
        "Settings",
      ]) {
        await section(page, name).click();
        await expect(section(page, name)).toHaveAttribute(
          "aria-current",
          "page",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        const result = await new AxeBuilder({ page })
          .include('[data-testid="live-team-page"]')
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          result.violations.map((finding) => ({
            id: finding.id,
            nodes: finding.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          })),
        ).toEqual([]);
      }
      await section(page, "Overview").click();
      await page.screenshot({
        path: test.info().outputPath(`team-overview-${width}.png`),
        fullPage: true,
      });
    }
  });
