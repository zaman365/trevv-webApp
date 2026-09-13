import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "../fixtures/live-workflow-browser";
import { attentionWorkspaceApi } from "../fixtures/attention-workspace-api";
import { issueSignals } from "../../apps/web/test-fixtures/attention-workspace-data";
import { item } from "../../apps/web/test-fixtures/live-workflow-data";

async function start(page: Page, hash = "") {
  const fixture = attentionWorkspaceApi();
  const work = await setup(page, hash, {
    view: "attention",
    attention: issueSignals,
    records: [
      {
        ...item,
        dueDate: "2020-09-01",
        description: "Deliver the launch checklist and approval.",
        assignees: [{ id: "user-one", name: "Owner" }],
      },
    ],
    api: fixture.api,
  });
  return { ...fixture, work };
}
const card = (page: Page, id = "issue-overdue") =>
  page.getByTestId(`attention-signal-${id}`);
const detail = (page: Page) => page.getByTestId("issue-detail");
const tab = (page: Page, name: string) =>
  detail(page)
    .getByRole("navigation", { name: "Issue sections" })
    .getByRole("button", { name, exact: true });

test("issue cards open all source details with keyboard, deep links and browser history", async ({
  page,
}) => {
  const { state } = await start(page);
  const trigger = card(page).getByRole("button", {
    name: "Ship the launch is overdue",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(detail(page)).toBeVisible();
  await expect(page).toHaveURL(/#issue=issue-overdue$/);
  await expect(
    detail(page).getByText("Deliver the launch checklist and approval."),
  ).toBeVisible();
  await detail(page).getByText("Source details", { exact: true }).click();
  await expect(
    detail(page).getByText('"dueDate": "2020-09-01"', { exact: false }),
  ).toBeVisible();
  expect(state.actions).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(detail(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.goBack();
  await expect(detail(page)).toBeVisible();
  await page.reload();
  await expect(detail(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await card(page)
    .getByText("Complete the task or agree a realistic deadline.")
    .click();
  await expect(detail(page)).toBeVisible();
});

test("Resolve opens a workflow, and ownership, deadlines and evidence resolve the underlying task", async ({
  page,
}) => {
  const { state, work } = await start(page);
  await card(page)
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await expect(tab(page, "Task & resolution")).toHaveAttribute(
    "aria-current",
    "page",
  );
  const task = detail(page).getByTestId("work-item-detail");
  await expect(
    task.getByRole("heading", { name: item.title, exact: true }),
  ).toBeVisible();
  expect(state.actions).toHaveLength(0);
  await task.getByLabel("Choose assignee").selectOption("user-two");
  await task.getByRole("button", { name: "Assign selected person" }).click();
  await expect(
    detail(page).getByText("Task assigned to Teammate.", { exact: true }),
  ).toBeVisible();
  await task.getByRole("button", { name: "Edit details" }).click();
  await task.getByLabel("Due date", { exact: true }).fill("2099-10-01");
  await task.getByRole("button", { name: "Save changes" }).click();
  await expect(
    task.getByText("Due Oct 1, 2099", { exact: true }),
  ).toBeVisible();
  await task
    .getByLabel("Evidence", { exact: true })
    .fill("Launch checklist approved and delivered.");
  await task.getByTestId("resolve-item-item-one").click();
  await expect(task.getByRole("button", { name: "Reopen task" })).toBeVisible();
  expect(work.transitions.map((entry) => entry.path)).toEqual(
    expect.arrayContaining([
      "/api/v1/items/item-one/assignees",
      "/api/v1/items/item-one",
      "/api/v1/items/item-one/resolve",
    ]),
  );
  expect(state.actions).toHaveLength(0);
});

test("follow-up tasks carry issue context and preserve the source task", async ({
  page,
}) => {
  const { state, work } = await start(page);
  await card(page)
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await tab(page, "Follow-up task").click();
  const capture = detail(page).getByTestId("live-quick-capture");
  await expect(capture.getByTestId("live-capture-title")).toHaveValue(
    "Follow up: Ship the launch is overdue",
  );
  await expect(
    capture.getByRole("textbox", { name: "Context · Optional", exact: true }),
  ).toHaveValue(/issue=issue-overdue/);
  await capture.getByLabel("Choose assignee").selectOption("user-two");
  await capture.getByTestId("live-capture-submit").click();
  await expect(
    detail(page).getByRole("link", { name: "Open created task" }),
  ).toHaveAttribute("href", /created-item$/);
  expect(work.creations[0]).toMatchObject({
    assigneeIds: ["user-two"],
    description: expect.stringContaining("#issue=issue-overdue"),
  });
  await tab(page, "Issue details").click();
  await expect(
    detail(page).getByRole("button", { name: "Ship the launch", exact: true }),
  ).toBeVisible();
  expect(state.actions).toHaveLength(0);
});

test("the outcome form is discoverable from issue details", async ({
  page,
}) => {
  await start(page, "#issue=issue-overdue");
  await detail(page)
    .getByText("Record an outcome, snooze, or dismiss", { exact: true })
    .click();
  await expect(detail(page).getByLabel("Outcome or reason")).toBeVisible();
  await expect(
    detail(page).getByRole("button", { name: "Confirm issue resolved" }),
  ).toBeDisabled();
});

test("communication creates a private request, retries safely and prepares an email without sending it", async ({
  page,
}) => {
  const { state, collaboration } = await start(page, "#issue=issue-overdue");
  await tab(page, "Communication").click();
  const communication = detail(page).getByRole("region", {
    name: "Issue communication",
  });
  await communication
    .getByLabel("Person", { exact: true })
    .selectOption("user-two");
  await communication.getByLabel("Message type").selectOption("request");
  await communication
    .getByLabel("Message", { exact: true })
    .fill(
      "Can you own the checklist and propose a deadline?\n\nhttps://trevv.test/app/workspaces/launch/attention#issue=issue-overdue",
    );
  await tab(page, "Issue details").click();
  await tab(page, "Communication").click();
  await expect(
    communication.getByLabel("Message", { exact: true }),
  ).toHaveValue(/propose a deadline/);
  collaboration.failNextMessage = true;
  await communication
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    communication.getByText("Please retry", { exact: true }),
  ).toBeVisible();
  await communication
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(
    communication.getByText("Message sent", { exact: true }),
  ).toBeVisible();
  expect(collaboration.conversationCreates).toBe(1);
  expect(collaboration.messageKeys[0]).toBe(collaboration.messageKeys[1]);
  expect(collaboration.messages.at(-1)).toMatchObject({
    intent: "request",
    responseOwnerId: "user-two",
    metadata: { attentionSignalId: "issue-overdue", entityId: "item-one" },
  });
  await communication
    .getByRole("button", { name: "Email draft", exact: true })
    .click();
  await communication
    .getByLabel("Email recipient")
    .fill("partner@example.test");
  const href = await communication
    .getByRole("link", { name: "Open draft in mail app" })
    .getAttribute("href");
  expect(href).toContain("mailto:partner%40example.test?");
  expect(decodeURIComponent(href!)).toContain("#issue=issue-overdue");
  expect(state.actions).toHaveLength(0);
});

test("stale workspace issues resolve through publishing a real update", async ({
  page,
}) => {
  const { state } = await start(page);
  await card(page, "issue-update")
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await expect(tab(page, "Workspace update")).toHaveAttribute(
    "aria-current",
    "page",
  );
  const review = detail(page).getByTestId("weekly-review-form");
  await review
    .getByLabel("Progress this week")
    .fill("Launch checklist completed.");
  await review.getByLabel("Next milestone").fill("Customer launch");
  await review.getByLabel("Priority next week").fill("Deliver the launch");
  await review.getByTestId("weekly-review-submit").click();
  await expect(
    detail(page).getByText("Weekly review is durable", { exact: true }),
  ).toBeVisible();
  await expect(card(page, "issue-update")).toHaveCount(0);
  expect(state.reviews).toHaveLength(1);
  expect(state.actions).toHaveLength(0);
});

test("snooze and dismissal require reasons and preserve drafts on failure", async ({
  page,
}) => {
  const { state } = await start(page);
  await card(page).getByRole("button", { name: "Snooze 24h" }).click();
  await expect(detail(page).getByLabel("Issue action")).toHaveValue("snooze");
  await detail(page)
    .getByLabel("Outcome or reason")
    .fill("Review with the owner tomorrow.");
  state.failAction = true;
  await detail(page).getByRole("button", { name: "Save snooze" }).click();
  await expect(
    detail(page).getByText("Could not confirm the issue action", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(detail(page).getByLabel("Outcome or reason")).toHaveValue(
    "Review with the owner tomorrow.",
  );
  await detail(page).getByRole("button", { name: "Retry action" }).click();
  await expect(
    detail(page).getByText("Issue snoozed for 24 hours", { exact: true }),
  ).toBeVisible();
  expect(state.actions[0]!.key).toBe(state.actions[1]!.key);
  expect(
    Date.parse(state.actions[1]!.input.snoozedUntil!) - Date.now(),
  ).toBeGreaterThan(86_300_000);
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await card(page, "issue-update")
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await detail(page)
    .getByLabel("Outcome or reason")
    .fill("The workspace is intentionally paused.");
  await detail(page).getByRole("button", { name: "Confirm dismissal" }).click();
  await expect(
    detail(page).getByText("Issue dismissed", { exact: true }),
  ).toBeVisible();
});

test("a missing confirmation can be reconciled without claiming failure or replaying the write", async ({
  page,
}) => {
  const { state } = await start(page);
  state.malformedAction = true;
  await card(page)
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await detail(page).getByLabel("Issue action").selectOption("resolve");
  await detail(page)
    .getByLabel("Outcome or reason")
    .fill("The launch was delivered and verified.");
  await detail(page)
    .getByRole("button", { name: "Confirm issue resolved" })
    .click();
  await expect(
    detail(page).getByText("Could not confirm the issue action", {
      exact: true,
    }),
  ).toBeVisible();
  await detail(page)
    .getByRole("button", { name: "Load latest", exact: true })
    .click();
  await expect(card(page)).toHaveCount(0);
  await expect(
    detail(page).getByText("Could not confirm the issue action", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(state.actions).toHaveLength(1);
});

test("recomputed issue versions can be reviewed and reapplied with the kept outcome", async ({
  page,
}) => {
  const { state } = await start(page);
  state.conflict = true;
  await card(page)
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await detail(page)
    .getByLabel("Outcome or reason")
    .fill("Confirmed duplicate of the launch review.");
  await detail(page).getByRole("button", { name: "Confirm dismissal" }).click();
  await expect(
    detail(page).getByText("A newer version is already saved", { exact: true }),
  ).toBeVisible();
  await detail(page).getByRole("button", { name: "Reapply to latest" }).click();
  await expect(
    detail(page).getByText("Issue dismissed", { exact: true }),
  ).toBeVisible();
  expect(state.actions[1]!.version).toBe('"2"');
  expect(state.actions[1]!.input.reason).toBe(state.actions[0]!.input.reason);
});

test("revoked source access removes issue details and communication actions", async ({
  page,
}) => {
  const { state } = await start(page, "#issue=issue-overdue");
  await expect(
    detail(page).getByText("Deliver the launch checklist and approval."),
  ).toBeVisible();
  state.sourceDenied = true;
  await expect(
    detail(page).getByText("The source task is no longer available", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    detail(page).getByText("Deliver the launch checklist and approval."),
  ).toHaveCount(0);
  await expect(tab(page, "Communication")).toHaveCount(0);
  await expect(
    detail(page).getByRole("button", { name: "Confirm issue resolved" }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const)
  test(`issue overlays support mobile and keyboard use in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page);
    await card(page)
      .getByRole("button", { name: "Resolve", exact: true })
      .click();
    for (const name of [
      "Issue details",
      "Task & resolution",
      "Follow-up task",
      "Communication",
    ]) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-current", "page");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(
        detail(page).getByRole("button", { name: "Close", exact: true }),
      ).toBeInViewport();
      const results = await new AxeBuilder({ page })
        .include('[data-testid="issue-detail"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map((finding) => ({
          id: finding.id,
          nodes: finding.nodes.map((node) => ({
            target: node.target,
            summary: node.failureSummary,
          })),
        })),
      ).toEqual([]);
    }
    await tab(page, "Issue details").click();
    await detail(page)
      .getByRole("button", { name: "Close issue details" })
      .focus();
    await page.keyboard.press("Shift+Tab");
    await expect(
      detail(page).getByRole("button", { name: "Close", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: test.info().outputPath("issue-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: test.info().outputPath("issue-desktop.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(detail(page)).toHaveCount(0);
  });
