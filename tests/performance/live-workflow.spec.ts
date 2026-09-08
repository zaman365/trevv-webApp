import { expect, test, type Page, type Route } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import type {
  InboxItemDto,
  WorkItemDto,
  WorkItemEvidenceDto,
} from "@founderhq/api-contract";
import {
  board,
  item,
  members,
  snapshot,
} from "../../apps/web/test-fixtures/live-workflow-data";

let directory = "";
const assets = new Map<string, Buffer>();
test.beforeAll(async () => {
  const require = createRequire(resolve("apps/web/package.json"));
  const { build } = await import(require.resolve("vite"));
  const shell = resolve("apps/web/test-fixtures/live-workflow-shell.tsx");
  directory = await mkdtemp(resolve(tmpdir(), "trevv-live-workflow-"));
  await build({
    configFile: false,
    root: resolve("apps/web"),
    logLevel: "error",
    resolve: {
      alias: [
        {
          find: "@founderhq/api-contract",
          replacement: resolve("packages/api-contract/src/index.ts"),
        },
        { find: "./workspace-frame", replacement: shell },
        { find: "@/components/navigation-link", replacement: shell },
        { find: "@/lib/navigation-performance", replacement: shell },
        { find: "@", replacement: resolve("apps/web") },
      ],
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: directory,
      minify: true,
      lib: {
        entry: resolve("apps/web/test-fixtures/live-workflow.tsx"),
        formats: ["es"],
        fileName: () => "harness.js",
      },
    },
  });
  for (const file of await readdir(directory))
    assets.set(`/${file}`, await readFile(resolve(directory, file)));
});
test.afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function setup(
  page: Page,
  hash = "",
  options: {
    dashboard?: boolean;
    records?: WorkItemDto[];
    operations?: (route: Route) => Promise<void>;
  } = {},
) {
  let records = options.records ?? [structuredClone(item)];
  let inbox: InboxItemDto[] = [];
  const evidence: WorkItemEvidenceDto[] = [];
  let holdReads = false;
  let holdInboxReads = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const creations: Array<Record<string, unknown>> = [];
  const conversions: Array<Record<string, unknown>> = [];
  const transitions: Array<{
    path: string;
    body: Record<string, unknown>;
    version: string;
  }> = [];
  await page.route("https://trevv.test/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div><script type="module" src="/harness.js"></script>',
      });
    if (assets.has(path))
      return route.fulfill({
        contentType: extname(path) === ".css" ? "text/css" : "text/javascript",
        body: assets.get(path)!,
      });
    if (path === "/api/v1/operations/status")
      return options.operations
        ? options.operations(route)
        : route.fulfill({ json: { pendingOutbox: 0, failedCount: 0 } });
    const existing = records.find(
      (record) =>
        path === `/api/v1/items/${record.id}` ||
        path.startsWith(`/api/v1/items/${record.id}/`),
    );
    if (existing && ["PATCH", "PUT", "POST"].includes(request.method())) {
      const input = request.postDataJSON();
      transitions.push({
        path,
        body: input,
        version: request.headers()["if-match"],
      });
      expect(request.headers()["if-match"]).toBe(`"${existing.version}"`);
      const next = {
        ...existing,
        ...input,
        version: existing.version + 1,
        ...(path.endsWith("/resolve") ? { status: "done" as const } : {}),
        ...(path.endsWith("/assignees")
          ? {
              assignees: members
                .filter((m) => input.assigneeIds.includes(m.user.id))
                .map((m) => ({ id: m.user.id, name: m.user.name })),
            }
          : {}),
      };
      if (input.dueDate === null) delete next.dueDate;
      records = records.map((record) =>
        record.id === next.id ? next : record,
      );
      if (path.endsWith("/evidence")) {
        const entry: WorkItemEvidenceDto = {
          id: `evidence-${evidence.length}`,
          itemId: next.id,
          author: { id: "user-one", name: "Owner" },
          body: input.body,
          evidence: true,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
        evidence.push(entry);
        return route.fulfill({
          headers: { etag: `"${next.version}"` },
          json: { evidence: entry, itemVersion: next.version },
        });
      }
      return route.fulfill({
        headers: { etag: `"${next.version}"` },
        json:
          request.method() === "PATCH"
            ? next
            : { item: next, attentionRefreshQueued: true },
      });
    }
    if (path === "/api/v1/inbox" && request.method() === "POST") {
      const input = request.postDataJSON();
      const captured = {
        ...input,
        id: "capture-one",
        userId: "user-one",
        version: 1,
        createdAt: item.createdAt,
      };
      inbox = [...inbox, captured];
      return route.fulfill({
        status: 201,
        headers: { etag: '"1"' },
        json: captured,
      });
    }
    if (path === "/api/v1/inbox/capture-one/convert") {
      const input = request.postDataJSON();
      conversions.push(input);
      const next = {
        ...item,
        ...input,
        id: "capture-one",
        assignees: members
          .filter((m) => input.assigneeIds.includes(m.user.id))
          .map((m) => ({ id: m.user.id, name: m.user.name })),
      };
      records = [...records, next];
      const converted = {
        ...inbox[0],
        convertedItemId: next.id,
        convertedAt: item.createdAt,
        version: 2,
      };
      inbox = [converted];
      return route.fulfill({
        headers: { etag: '"2"' },
        json: { inboxItem: converted, workItem: next },
      });
    }
    if (path === "/api/v1/items" && request.method() === "POST") {
      const input = request.postDataJSON();
      creations.push(input);
      const next = {
        ...item,
        ...input,
        id: "created-item",
        assignees: members
          .filter((m) => input.assigneeIds.includes(m.user.id))
          .map((m) => ({ id: m.user.id, name: m.user.name })),
      };
      records = [...records, next];
      return route.fulfill({
        status: 201,
        headers: { etag: '"1"' },
        json: next,
      });
    }
    if (path === "/api/v1/items" && holdReads) await held;
    if (path === "/api/v1/inbox" && holdInboxReads) await held;
    const json =
      existing && path === `/api/v1/items/${existing.id}`
        ? existing
        : existing && path.endsWith("/evidence")
          ? evidence.filter((entry) => entry.itemId === existing.id)
          : path === "/api/v1/portfolios"
            ? snapshot.portfolios
            : path === "/api/v1/workspaces"
              ? snapshot.workspaces
              : path === "/api/v1/items"
                ? { data: records, nextCursor: null }
                : path === "/api/v1/boards"
                  ? [board]
                  : path === `/api/v1/boards/${board.id}`
                    ? board
                    : path === `/api/v1/workspaces/${board.workspaceId}/teams`
                      ? {
                          teams: [],
                          availableMembers: members.map((member) => ({
                            ...member.user,
                            organizationRole: member.role,
                          })),
                        }
                      : path === "/api/v1/inbox"
                        ? inbox
                        : path === "/api/v1/attention" ||
                            path === "/api/v1/invitations" ||
                            path === "/api/v1/waiting" ||
                            /\/(history|evidence)$/.test(path)
                          ? []
                          : undefined;
    if (json === undefined)
      throw new Error(`Unexpected request: ${request.method()} ${path}`);
    return route.fulfill({ json });
  });
  await page.goto(
    `https://trevv.test/${options.dashboard ? "?view=dashboard" : ""}${hash}`,
  );
  if (options.dashboard) {
    await expect(page.getByTestId("live-dashboard")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Project progress", exact: true })
        .getByRole("link", {
          name: new RegExp(board.name),
        }),
    ).toBeVisible();
  } else {
    await expect(page.getByTestId("live-board")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: board.name, exact: true }),
    ).toBeVisible();
  }
  return {
    setRecords: (next: WorkItemDto[]) => {
      records = next;
    },
    creations,
    conversions,
    transitions,
    hold: () => {
      holdReads = true;
    },
    holdInbox: () => {
      holdInboxReads = true;
    },
    release,
    change: () => {
      records = records.map((record) => ({
        ...record,
        version: record.version + 1,
      }));
    },
  };
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
    await expect(page.getByTestId("work-item-detail")).toContainText(
      "Prepare launch",
    );
    await expect(page.getByRole("region", { name: "My tasks" })).toContainText(
      "Prepare launch",
    );
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
  await page.getByRole("button", { name: item.title }).click();
  const detail = page.getByTestId("work-item-detail");
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
    page.getByRole("region", { name: "My tasks" }),
  ).not.toContainText(item.title);
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
  await expect(page.getByRole("region", { name: "My tasks" })).toContainText(
    item.title,
  );
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

test("refresh does not reopen a closed deep-linked task drawer", async ({
  page,
}) => {
  const state = await setup(page, "#item-one");
  const detail = page.getByTestId("work-item-detail");
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: /Close/ }).click();
  await expect(detail).toHaveCount(0);
  state.change();
  await page.getByRole("button", { name: "Refresh test records" }).click();
  await expect(page.getByTestId("live-board")).toContainText("v2");
  await expect(detail).toHaveCount(0);
});

test("a failed board refresh preserves the open task and draft, while revoked access removes it", async ({
  page,
}) => {
  await setup(page, "#item-one");
  const detail = page.getByTestId("work-item-detail");
  await detail
    .getByLabel("Reason or follow-up note")
    .fill("Keep during reconnect");
  let status = 503;
  await page.route(`**/api/v1/boards/${board.id}`, (route) =>
    route.fulfill({
      status,
      json: {
        error: { code: "test_failure", message: "Test board read failure" },
      },
    }),
  );
  await page.getByRole("button", { name: "Refresh board metadata" }).click();
  await expect(page.getByRole("button", { name: "Retry board" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(detail.getByLabel("Reason or follow-up note")).toHaveValue(
    "Keep during reconnect",
  );
  status = 403;
  await page.getByRole("button", { name: "Refresh board metadata" }).click();
  await expect(
    page.getByRole("heading", { name: board.name, exact: true }),
  ).toHaveCount(0);
  await expect(detail).toHaveCount(0);
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
  await boardView
    .getByRole("region", { name: /^working/ })
    .getByLabel("Status for Draft project brief")
    .selectOption("review");
  await expect(
    boardView.getByRole("region", { name: /^review/ }),
  ).toContainText("Draft project brief");
  const myWork = page.getByRole("region", { name: "My tasks" });
  await myWork.getByRole("button", { name: /^Completed / }).click();
  await expect(
    myWork.getByRole("link", { name: /Ship the completed launch/ }),
  ).toHaveAttribute(
    "href",
    "/app/workspaces/launch/boards/board-one#completed-task",
  );
  await boardView.getByRole("button", { name: "List", exact: true }).click();
  await boardView.getByLabel("Search tasks").fill("brief");
  await expect(boardView.getByTestId("work-item-overdue-task")).toHaveCount(0);
  await expect(boardView.getByTestId("work-item-undated-task")).toBeVisible();
});

test("task edits survive refreshes, remove deadlines, and preserve saved updates", async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole("button", { name: item.title }).click();
  const detail = page.getByTestId("work-item-detail");
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
    .getByRole("button", { name: "Refresh test records" })
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
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
});
