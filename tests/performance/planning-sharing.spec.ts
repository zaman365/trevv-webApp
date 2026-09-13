import { expect, test, type Page, type Route } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import { teamWorkspaceApi } from "../fixtures/team-workspace-api";
import {
  board,
  item,
  session,
} from "../../apps/web/test-fixtures/live-workflow-data";
import {
  teamConversation,
  teamMessage,
} from "../../apps/web/test-fixtures/team-workspace-data";
import {
  createConversationSchema,
  type ConversationDto,
  type ConversationMessageDto,
} from "@founderhq/api-contract";

function planningApi() {
  const base = teamWorkspaceApi();
  base.state.boards[0]!.name = board.name;
  const requests: {
    key: string;
    input: ReturnType<typeof createConversationSchema.parse>;
  }[] = [];
  const committed = new Map<string, ConversationDto>();
  const messages: ConversationMessageDto[] = [];
  let loseResponse = false;
  let denied = false;
  async function api(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.pathname === `/api/v1/workspaces/${board.workspaceId}/conversations`
    ) {
      if (request.method() === "GET" && denied) {
        await route.fulfill({
          status: 403,
          json: { error: { code: "forbidden", message: "Access removed" } },
        });
        return true;
      }
      if (request.method() === "POST" && request.postDataJSON().context) {
        const input = createConversationSchema.parse(request.postDataJSON());
        const key = request.headers()["idempotency-key"]!;
        requests.push({ key, input });
        let room = committed.get(key);
        if (!room) {
          room = {
            ...teamConversation,
            ...input,
            id: `discussion-${committed.size}`,
            participants: teamConversation.participants.filter((entry) =>
              input.participantIds.includes(entry.user.id),
            ),
            unreadCount: 1,
          };
          delete room.teamId;
          committed.set(key, room);
          base.state.conversations.push(room);
          messages.push({
            ...teamMessage,
            id: `announcement-${messages.length}`,
            conversationId: room.id,
            body: input.openingMessage!,
            parentMessageId: undefined,
          });
        }
        if (loseResponse) {
          loseResponse = false;
          await route.fulfill({
            status: 503,
            json: { error: { code: "unavailable", message: "Response lost" } },
          });
        } else
          await route.fulfill({
            status: 201,
            headers: { etag: '"1"' },
            json: room,
          });
        return true;
      }
    }
    const readRoom = [...committed.values()].find(
      (entry) =>
        url.pathname === `/api/v1/conversations/${entry.id}/read-checkpoint`,
    );
    if (readRoom && request.method() === "PUT") {
      readRoom.unreadCount = 0;
      const messageId = request.postDataJSON().messageId;
      await route.fulfill({
        json: {
          conversationId: readRoom.id,
          userId: session.user.id,
          messageId,
          messageSequence:
            messages.find((entry) => entry.id === messageId)?.sequence ?? 1,
          version: 1,
          readAt: teamMessage.createdAt,
        },
      });
      return true;
    }
    const room = [...committed.values()].find(
      (entry) => url.pathname === `/api/v1/conversations/${entry.id}/messages`,
    );
    if (room) {
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        const message = {
          ...teamMessage,
          ...input,
          id: `reply-${messages.length}`,
          sequence: messages.length + 1,
          conversationId: room.id,
        };
        messages.push(message);
        await route.fulfill({
          status: 201,
          headers: { etag: '"1"' },
          json: message,
        });
      } else
        await route.fulfill({
          json: {
            data: messages.filter(
              (entry) =>
                entry.conversationId === room.id &&
                (url.searchParams.has("parentMessageId")
                  ? entry.parentMessageId ===
                    url.searchParams.get("parentMessageId")
                  : !entry.parentMessageId),
            ),
            nextCursor: null,
          },
        });
      return true;
    }
    return base.api(route);
  }
  return {
    ...base,
    api,
    requests,
    committed,
    messages,
    loseNextResponse: () => {
      loseResponse = true;
    },
    deny: () => {
      denied = true;
    },
  };
}

async function dashboard(page: Page) {
  const api = planningApi();
  const fixture = await setup(page, "", {
    dashboard: true,
    styled: true,
    api: api.api,
  });
  return { ...api, ...fixture };
}
async function includeTeam(page: Page) {
  const fields = page.getByRole("group", {
    name: "Team and collaborators",
    exact: true,
  });
  await fields.getByLabel("Related team").selectOption("team-launch");
  await fields.getByLabel("Include people in a shared discussion").check();
  await fields
    .getByRole("button", { name: "Select everyone on this team" })
    .click();
  await fields
    .getByLabel("Invitation note")
    .fill("Please help shape the first milestone.");
}

test("plan creation optionally includes selected teammates, announces once and appears on dashboard and personal work", async ({
  page,
}) => {
  const state = await dashboard(page);
  await page.getByTestId("create-board-open").click();
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Customer discovery plan");
  await includeTeam(page);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Plan and idea sharing" }),
  ).toContainText("Shared with your selected people");
  expect(state.state.plans).toHaveLength(1);
  expect(state.state.plans[0]!.planning?.teamId).toBe("team-launch");
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0]!.input.participantIds.sort()).toEqual([
    "user-one",
    "user-two",
  ]);
  expect(state.requests[0]!.input.openingMessage).toContain(
    "Please help shape the first milestone.",
  );
  expect(state.requests[0]!.input.context).toEqual({
    entityType: "board",
    entityId: state.state.plans[0]!.id,
  });
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Customer discovery plan" }),
  });
  await expect(
    card.getByRole("link", { name: /Open discussion/ }),
  ).toHaveAttribute("href", /messages#discussion-0$/);
  await page.getByRole("tab", { name: "My Work", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Plans and ideas involving me" }),
  ).toContainText("Customer discovery plan");
});

test("a lost sharing response keeps the created plan and resumes safely after reload", async ({
  page,
}) => {
  const state = await dashboard(page);
  state.loseNextResponse();
  await page.getByTestId("create-board-open").click();
  await page.getByLabel("Plan name", { exact: true }).fill("Retry-safe plan");
  await includeTeam(page);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry sharing" }),
  ).toBeEnabled();
  expect(state.state.plans).toHaveLength(1);
  const firstKey = state.requests[0]!.key;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry sharing" }),
  ).toBeEnabled();
  expect(state.requests).toHaveLength(1);
  await page.getByRole("button", { name: "Retry sharing" }).click();
  await expect(
    page.getByRole("complementary", { name: "Plan and idea sharing" }),
  ).toContainText("Shared with your selected people");
  expect(state.requests[1]!.key).toBe(firstKey);
  expect(state.committed.size).toBe(1);
  expect(state.messages).toHaveLength(1);
  expect(state.state.plans).toHaveLength(1);
});

test("an idea shares from Quick capture and retains the selected people with its draft", async ({
  page,
}) => {
  const api = planningApi();
  const fixture = await setup(page, "", { view: "capture", api: api.api });
  await page
    .getByRole("button", { name: "Quick capture", exact: true })
    .click();
  await page.getByRole("tab", { name: "Idea", exact: true }).click();
  await page
    .getByTestId("live-capture-title")
    .fill("A simpler onboarding journey");
  await includeTeam(page);
  await page
    .getByRole("button", { name: "Close capture", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quick capture", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "Team and collaborators" })
      .getByText("1 selected · you are included"),
  ).toBeVisible();
  await page.getByTestId("live-capture-submit").click();
  await expect(
    page.getByRole("complementary", { name: "Plan and idea sharing" }),
  ).toContainText("Shared with your selected people");
  expect(fixture.creations).toHaveLength(1);
  expect(fixture.creations[0]!.type).toBe("idea");
  expect(fixture.creations[0]!.planning).toMatchObject({
    teamId: "team-launch",
  });
  expect(api.requests[0]!.input.context?.entityType).toBe("work_item");
});

test("sharing stays optional and enabling it requires an explicit recipient", async ({
  page,
}) => {
  const state = await dashboard(page);
  await page.getByTestId("create-board-open").click();
  await page.getByLabel("Plan name", { exact: true }).fill("Personal planning");
  const sharing = page.getByLabel("Include people in a shared discussion");
  await sharing.check();
  await expect(
    page.getByRole("button", { name: "Create plan", exact: true }),
  ).toBeDisabled();
  await sharing.uncheck();
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page.getByTestId("create-board-dialog")).toHaveCount(0);
  expect(state.state.plans).toHaveLength(1);
  expect(state.requests).toHaveLength(0);
});

test("Team overview keeps shared planning in its team and can invite collaborators later", async ({
  page,
}) => {
  const api = planningApi();
  await setup(page, "", { view: "team", api: api.api });
  const hub = page.getByRole("region", {
    name: "Plans and ideas",
    exact: true,
  });
  await expect(hub).toContainText(board.name);
  await expect(hub).not.toContainText("Operations project");
  await hub
    .getByRole("button", { name: "Include people", exact: true })
    .click();
  await includeTeam(page);
  await page
    .getByRole("button", { name: "Share and start discussion" })
    .click();
  await expect(
    hub.getByRole("link", { name: /Open discussion/ }),
  ).toBeVisible();
  expect(api.requests[0]!.input.context?.entityId).toBe(board.id);
});

test("the dashboard Plans and ideas tab opens creation and filters without navigating away", async ({
  page,
}) => {
  await dashboard(page);
  await page.getByRole("tab", { name: "Plans and ideas", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Plans and ideas" });
  await expect(
    panel.getByRole("link", { name: "Open Plans and ideas full page" }),
  ).toHaveAttribute("href", "/app/workspaces/launch/ideas");
  await panel.getByLabel("Show plans or ideas").selectOption("ideas");
  await expect(panel.getByRole("article")).toHaveCount(0);
  await panel.getByRole("button", { name: "New idea", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Idea", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a linked discussion supports a message and a route back to its plan", async ({
  page,
}) => {
  const state = await dashboard(page);
  await page.getByTestId("create-board-open").click();
  await page.getByLabel("Plan name", { exact: true }).fill("Discussion plan");
  await includeTeam(page);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Plan and idea sharing" }),
  ).toContainText("Shared with your selected people");
  await page.goto("https://trevv.test/?view=messages#discussion-0");
  await expect(
    page.getByRole("link", { name: "Open linked plan" }),
  ).toHaveAttribute("href", /boards\/plan-0$/);
  await expect(
    page
      .getByText("Please help shape the first milestone.", { exact: false })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("I will prepare the first milestone.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => state.messages.length).toBe(2);
  expect(state.messages[1]!.body).toBe("I will prepare the first milestone.");
});

test("the mobile plan dialog scrolls while keeping its actions reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dashboard(page);
  await page.getByTestId("create-board-open").click();
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Mobile shared plan");
  await includeTeam(page);
  await page.screenshot({ path: "/private/tmp/trevv-planning-mobile.png" });
  const dialog = page.getByTestId("create-board-dialog");
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Plan and idea sharing" }),
  ).toContainText("Shared with your selected people");
});

test("plans and discussions are hidden when workspace conversation access is lost", async ({
  page,
}) => {
  const state = await dashboard(page);
  await expect(
    page.getByRole("region", { name: "Plans and ideas", exact: true }),
  ).toContainText(board.name);
  state.deny();
  await page.reload();
  const hub = page.getByRole("region", {
    name: "Plans and ideas",
    exact: true,
  });
  await expect(
    hub.getByRole("button", { name: "Refresh plans and discussions" }),
  ).toBeVisible();
  await expect(hub.getByRole("article")).toHaveCount(0);
});

test("the project editor shares its saved plan without losing project settings", async ({
  page,
}) => {
  const state = await dashboard(page);
  await page.getByRole("tab", { name: "Projects", exact: true }).click();
  await page
    .getByRole("button", { name: "New project / plan", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Plan name", { exact: true })
    .fill("Collaborative delivery plan");
  await dialog.getByLabel("Team", { exact: true }).selectOption("team-launch");
  await dialog
    .getByLabel("Plan type", { exact: true })
    .selectOption("campaign");
  await dialog.getByLabel("Target date", { exact: true }).fill("2027-01-20");
  const people = dialog.getByRole("group", { name: "Team and collaborators" });
  await people.getByLabel("Include people in a shared discussion").check();
  await people
    .getByRole("button", { name: "Select everyone on this team" })
    .click();
  await dialog
    .getByRole("button", { name: "Create plan", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Plan and idea sharing" }),
  ).toContainText("Shared with your selected people");
  expect(state.state.plans).toHaveLength(1);
  expect(state.state.plans[0]!.planning).toMatchObject({
    kind: "campaign",
    teamId: "team-launch",
  });
  expect(state.state.plans[0]!.endDate).toBe("2027-01-20");
  expect(state.requests[0]!.input.context).toEqual({
    entityType: "board",
    entityId: state.state.plans[0]!.id,
  });
});
