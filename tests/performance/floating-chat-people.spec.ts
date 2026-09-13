import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "../fixtures/live-workflow-browser";
import { teamWorkspaceApi } from "../fixtures/team-workspace-api";
import {
  teamConversation,
  teamItems,
} from "../../apps/web/test-fixtures/team-workspace-data";

const chatWindow = (page: Page) =>
  page.getByRole("dialog", { name: "Floating chats", exact: true });
async function start(
  page: Page,
  view: "chat" | "person" | "people" | "messages" = "chat",
) {
  const fixture = teamWorkspaceApi();
  const work = await setup(page, "", {
    view,
    records: structuredClone(teamItems),
    api: fixture.api,
  });
  return { ...fixture, work };
}
async function openTeamChat(page: Page) {
  await page.getByLabel("Open chats", { exact: true }).click();
  const floating = chatWindow(page);
  await floating.getByRole("tab", { name: "Teams", exact: true }).click();
  await floating.getByRole("button", { name: "Open Launch team chat" }).click();
  await expect(floating.getByLabel("Message", { exact: true })).toBeVisible();
  return floating;
}

test("floating conversation sends and retries real messages without changing the page, and keeps drafts after minimizing", async ({
  page,
}) => {
  const fixture = await start(page);
  const floating = await openTeamChat(page);
  await expect(page).toHaveURL("https://trevv.test/?view=chat");
  await expect(
    floating.getByText("The launch brief is ready for review.", {
      exact: true,
    }),
  ).toBeVisible();
  const composer = floating.getByLabel("Message", { exact: true });
  await composer.fill("Please review the revised scope.");
  fixture.state.failNextMessage = true;
  await floating.getByRole("button", { name: "Send", exact: true }).click();
  await expect(composer).toHaveValue("Please review the revised scope.");
  await floating
    .getByRole("button", { name: "Retry send", exact: true })
    .click();
  await expect(composer).toHaveValue("");
  await expect(
    floating.getByText("Please review the revised scope.", { exact: true }),
  ).toBeVisible();
  expect(fixture.state.messageKeys).toHaveLength(2);
  expect(fixture.state.messageKeys[0]).toBe(fixture.state.messageKeys[1]);
  await composer.fill("Saved while I check the project");
  await floating.getByRole("button", { name: "Minimize chat window" }).click();
  await expect(floating).toHaveCount(0);
  await page.getByRole("link", { name: "Projects on this page" }).click();
  await page.getByLabel("Open chats", { exact: true }).click();
  await expect(composer).toHaveValue("Saved while I check the project");
  await expect(page).toHaveURL(/#projects$/);
  await page.screenshot({
    path: test.info().outputPath("floating-chat-desktop.png"),
  });
});

test("people chats reuse existing conversations and support independent closable tabs", async ({
  page,
}) => {
  const fixture = await start(page);
  const direct = {
    ...structuredClone(teamConversation),
    id: "direct-existing",
    kind: "direct" as const,
    title: "Owner & Teammate",
  };
  delete direct.teamId;
  fixture.state.conversations.push(direct);
  const floating = await openTeamChat(page);
  await floating.getByLabel("Message", { exact: true }).fill("Team draft");
  await floating.getByRole("tab", { name: "People", exact: true }).click();
  await floating.getByRole("button", { name: "Chat with Teammate" }).click();
  await expect(
    floating.getByRole("tab", { name: "Owner & Teammate" }),
  ).toHaveAttribute("aria-selected", "true");
  expect(fixture.state.conversationCreates).toBe(0);
  await floating.getByRole("tab", { name: "Launch team", exact: true }).click();
  await expect(floating.getByLabel("Message", { exact: true })).toHaveValue(
    "Team draft",
  );
  await floating.getByRole("tab", { name: "Owner & Teammate" }).click();
  await floating
    .getByRole("button", { name: "Close Owner & Teammate tab" })
    .click();
  await expect(
    floating.getByRole("tab", { name: "Owner & Teammate" }),
  ).toHaveCount(0);
});

test("profile scopes a person's work, opens task actions, assigns a task, and links communication", async ({
  page,
}) => {
  const fixture = await start(page, "person");
  await expect(
    page.getByRole("heading", { name: "Teammate", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 Blocked", exact: true }).click();
  await expect(page).toHaveURL(/#work$/);
  await expect(
    page.getByRole("button", { name: /Unblock creative review/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Review launch brief", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Unblock creative review/ }).click();
  await expect(page.getByTestId("work-item-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Assign task", exact: true }).click();
  const capture = page.getByTestId("live-quick-capture");
  await expect(
    capture.getByLabel("Choose assignee", { exact: true }),
  ).toHaveValue("user-two");
  await capture
    .getByTestId("live-capture-title")
    .fill("Clarify the review deadline");
  await capture.getByTestId("live-capture-submit").click();
  await expect.poll(() => fixture.work.creations.length).toBe(1);
  expect(fixture.work.creations[0]).toMatchObject({
    assigneeIds: ["user-two"],
  });
  await expect(page.getByRole("link", { name: "Write email" })).toHaveAttribute(
    "href",
    /^mailto:/,
  );
  await page.getByRole("button", { name: "Start chat", exact: true }).click();
  await expect(
    chatWindow(page).getByRole("tab", { name: /Teammate/ }),
  ).toHaveAttribute("aria-selected", "true");
  expect(fixture.state.conversationCreates).toBe(1);
});

test("person cards open on hover and keyboard, and mobile chat remains actionable", async ({
  page,
}) => {
  await start(page, "people");
  const person = page.getByRole("button", { name: "Teammate", exact: true });
  await person.hover();
  const card = page.getByRole("dialog", { name: "Teammate profile card" });
  await expect(
    card.getByRole("link", { name: "Full profile" }),
  ).toHaveAttribute("href", "/app/workspaces/launch/people/user-two");
  await card.getByRole("button", { name: "Close person card" }).click();
  await expect(person).toBeFocused();
  await person.press("ArrowDown");
  await expect(card).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  const floating = await openTeamChat(page);
  await expect(
    floating.getByRole("button", { name: "Back to chat directory" }),
  ).toBeVisible();
  await expect(
    floating.getByRole("button", { name: "Send", exact: true }),
  ).toBeInViewport();
  const violations = (
    await new AxeBuilder({ page })
      .include("#floating-chat-window")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations;
  expect(violations).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("floating-chat-mobile.png"),
  });
});

test("floating chats preserve threaded replies, reactions and participant context", async ({
  page,
}) => {
  const fixture = await start(page);
  const floating = await openTeamChat(page);
  await floating
    .getByRole("button", { name: "Add thumbs up reaction" })
    .click();
  await expect(
    floating.getByRole("button", { name: "Remove 👍 reaction, 1 total" }),
  ).toBeVisible();
  await floating.getByRole("button", { name: "Reply to Teammate" }).click();
  await floating
    .getByLabel("Message", { exact: true })
    .fill("We can agree on Friday.");
  await floating.getByRole("button", { name: "Send", exact: true }).click();
  await expect(floating.getByLabel("Message", { exact: true })).toHaveValue("");
  expect(fixture.state.messages.at(-1)).toMatchObject({
    parentMessageId: "message-one",
    body: "We can agree on Friday.",
  });
  await expect(
    floating
      .getByRole("region", { name: "Replies to Teammate" })
      .getByText("We can agree on Friday.", { exact: true }),
  ).toBeVisible();
  await floating
    .getByRole("button", { name: "Open conversation context" })
    .click();
  const context = page.getByRole("dialog", {
    name: "Launch team context",
    exact: true,
  });
  await expect(context).toBeVisible();
  await expect(
    context.getByText("Launch updates", { exact: true }),
  ).toBeVisible();
  await context
    .getByRole("button", { name: "Close conversation context" })
    .click();
  await expect(
    floating.getByRole("button", { name: "Open conversation context" }),
  ).toBeFocused();
});

test("full Messages and floating chats hand drafts over without overwriting each other", async ({
  page,
}) => {
  await start(page, "messages");
  const pageComposer = page.locator("#live-message-composer");
  await expect(pageComposer).toBeEnabled();
  await pageComposer.fill("Started on the full page");
  const floating = await openTeamChat(page);
  await expect(floating.getByLabel("Message", { exact: true })).toHaveValue(
    "Started on the full page",
  );
  await expect(pageComposer).toHaveCount(0);
  await floating
    .getByLabel("Message", { exact: true })
    .fill("Continued in the floating window");
  await floating.getByRole("button", { name: "Minimize chat window" }).click();
  await expect(pageComposer).toHaveValue("Continued in the floating window");
  await page.reload();
  await expect(pageComposer).toHaveValue("Continued in the floating window");
});

test("new conversations open in a tab and revoked directory access removes personal details", async ({
  page,
}) => {
  const fixture = await start(page);
  await page.getByLabel("Open chats", { exact: true }).click();
  const floating = chatWindow(page);
  await floating
    .getByRole("button", { name: "New thread", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Choose its job",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Room name", { exact: true })
    .fill("Review the launch scope");
  await dialog.getByRole("checkbox", { name: /Teammate/ }).check();
  await dialog
    .getByRole("button", { name: "Create room", exact: true })
    .click();
  await expect(
    floating.getByRole("tab", { name: "Review the launch scope" }),
  ).toHaveAttribute("aria-selected", "true");
  fixture.state.denied = true;
  await floating.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    floating.getByText("Chat access changed", { exact: true }),
  ).toBeVisible();
  await expect(
    floating.getByRole("tab", { name: "Review the launch scope" }),
  ).toHaveCount(0);
  await expect(floating.getByLabel("Message", { exact: true })).toHaveCount(0);
});

for (const theme of ["light", "dark"])
  test(`people profiles and cards remain accessible in ${theme}`, async ({
    page,
  }) => {
    await start(page, "person");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const sections = page.getByRole("navigation", { name: "Person sections" });
    await expect(
      page.getByRole("heading", { name: "Teammate", exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await sections.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Launch campaign", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Operations project", exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await sections.getByRole("link", { name: "Overview", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`person-${theme}.png`),
      fullPage: true,
    });
  });

test("chat opened from a person card in a team dialog stays above the dialog and keeps its actions usable", async ({
  page,
}) => {
  const fixture = teamWorkspaceApi();
  await setup(page, "", { view: "teams", api: fixture.api });
  await page
    .getByRole("button", { name: "Manage Launch team", exact: true })
    .click();
  await page.getByRole("button", { name: "Teammate", exact: true }).hover();
  const card = page.getByRole("dialog", {
    name: "Teammate profile card",
    exact: true,
  });
  await card.getByRole("button", { name: "Start chat", exact: true }).click();
  const floating = chatWindow(page);
  await expect(floating.getByLabel("Message", { exact: true })).toBeVisible();
  await floating
    .getByLabel("Message", { exact: true })
    .fill("A draft above the team dialog");
  await floating.getByRole("button", { name: "Expand chat window" }).click();
  await expect(
    floating.getByRole("button", { name: "Restore chat window" }),
  ).toBeVisible();
  await floating.getByRole("button", { name: "Close chat window" }).click();
  await expect(floating).toHaveCount(0);
});
