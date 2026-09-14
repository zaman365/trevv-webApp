import { expect, test, type Page, type Route } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname } from "node:path";
import type {
  InboxItemDto,
  WorkspaceDto,
  TeamDto,
  WorkItemDto,
  WorkItemEvidenceDto,
  AttentionSignalDto,
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
          find: /^@founderhq\/api-contract$/,
          replacement: resolve("packages/api-contract/src/index.ts"),
        },
        { find: "next/navigation", replacement: shell },
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

export async function setup(
  page: Page,
  hash = "",
  options: {
    dashboard?: boolean;
    styled?: boolean;
    view?:
      | "task"
      | "portfolio"
      | "personal"
      | "calendar"
      | "planning"
      | "report-log"
      | "report-plan"
      | `page-${string}`
      | "teams"
      | "team"
      | "attention"
      | "capture"
      | "messages"
      | "people"
      | "person"
      | "chat";
    attention?: AttentionSignalDto[];
    teamId?: string;
    api?: (route: Route) => Promise<boolean>;
    teams?: TeamDto[];
    records?: WorkItemDto[];
    workspaces?: WorkspaceDto[];
    operations?: (route: Route) => Promise<void>;
  } = {},
) {
  let records = options.records ?? [structuredClone(item)];
  let teamRecords = options.teams ?? [];
  let teamAccessDenied = false;
  let inbox: InboxItemDto[] = [];
  const evidence: WorkItemEvidenceDto[] = [];
  let holdReads = false;
  let holdInboxReads = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const creations: Array<Record<string, unknown>> = [];
  if (
    options.records ||
    options.dashboard ||
    options.view === "portfolio" ||
    options.view === "personal" ||
    options.view === "calendar" ||
    options.view?.startsWith("page-") ||
    options.view === "team" ||
    options.view === "attention" ||
    options.view === "person" ||
    options.view === "people"
  ) {
    await page.addInitScript((items) => {
      Object.defineProperty(window, "__workflowInitialItems", { value: items });
    }, records);
  }
  if (options.workspaces)
    await page.addInitScript((records) => {
      Object.defineProperty(window, "__workflowWorkspaces", { value: records });
    }, options.workspaces);
  if (options.attention)
    await page.addInitScript((signals) => {
      Object.defineProperty(window, "__workflowAttention", { value: signals });
    }, options.attention);
  const conversions: Array<Record<string, unknown>> = [];
  const transitions: Array<{
    path: string;
    body: Record<string, unknown>;
    version: string;
  }> = [];
  await page.route("https://trevv.test/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/" || /\/tasks\/[^/]+$/.test(path))
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><title>TREVV test workspace</title>${
          Boolean(options.view) || options.styled
            ? '<meta name="viewport" content="width=device-width, initial-scale=1">' +
              [...assets.keys()]
                .filter((path) => extname(path) === ".css")
                .map((path) => `<link rel="stylesheet" href="${path}">`)
                .join("")
            : ""
        }</head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`,
      });
    if (assets.has(path))
      return route.fulfill({
        contentType: extname(path) === ".css" ? "text/css" : "text/javascript",
        body: assets.get(path)!,
      });
    if (options.api && (await options.api(route))) return;
    if (path.endsWith("/report-plans") && request.method() === "GET")
      return route.fulfill({ json: { data: [], page: 1, hasMore: false } });
    if (path === `/api/v1/workspaces/${board.workspaceId}/conversation-unread`)
      return route.fulfill({ json: { unreadCount: 0 } });
    if (
      path === `/api/v1/workspaces/${board.workspaceId}/conversations` &&
      request.method() === "GET"
    )
      return route.fulfill({ json: { data: [], nextCursor: null } });
    if (path === "/api/v1/operations/status")
      return options.operations
        ? options.operations(route)
        : route.fulfill({ json: { pendingOutbox: 0, failedCount: 0 } });
    if (
      path === `/api/v1/workspaces/${board.workspaceId}/teams` &&
      teamAccessDenied
    )
      return route.fulfill({
        status: 403,
        json: {
          error: { code: "forbidden", message: "Team access was removed." },
        },
      });
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
        id:
          creations.length === 1
            ? "created-item"
            : `created-item-${creations.length}`,
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
              ? (options.workspaces ?? snapshot.workspaces)
              : path === "/api/v1/items"
                ? { data: records, nextCursor: null }
                : path === "/api/v1/boards"
                  ? [board]
                  : path === `/api/v1/boards/${board.id}`
                    ? board
                    : path === `/api/v1/workspaces/${board.workspaceId}/teams`
                      ? {
                          teams: teamRecords,
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
    `https://trevv.test/${options.view ? `?view=${options.view}${options.teamId ? `&teamId=${options.teamId}` : ""}` : options.dashboard ? "?view=dashboard" : ""}${hash}`,
  );
  if (options.view === "report-log" || options.view === "report-plan") {
    await expect(
      page.getByRole("heading", { name: "Report & Log", exact: true }),
    ).toBeVisible();
  } else if (options.view === "attention") {
    await expect(
      page.getByRole("heading", { name: "Open signals" }),
    ).toBeVisible();
  } else if (options.view === "team") {
    await expect(page.getByTestId("live-team-page")).toBeVisible();
  } else if (options.view === "teams") {
    await expect(page.getByTestId("live-teams")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Team summary" })
        .getByRole("button")
        .first(),
    ).toBeEnabled();
  } else if (
    options.view === "chat" ||
    options.view === "people" ||
    options.view === "person"
  ) {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } else if (options.view === "messages") {
    await expect(
      page.getByRole("heading", { name: "Messages", exact: true }),
    ).toBeVisible();
  } else if (options.view === "portfolio") {
    await expect(page.getByTestId("live-portfolio")).toBeVisible();
  } else if (options.view === "personal") {
    await expect(page.getByTestId("live-personal-work")).toBeVisible();
  } else if (options.view === "calendar") {
    await expect(
      page.getByRole("heading", { name: "Calendar", exact: true }),
    ).toBeVisible();
  } else if (options.view?.startsWith("page-")) {
    await expect(
      page.getByTestId(`live-${options.view.slice(5)}`),
    ).toBeVisible();
  } else if (options.view === "planning") {
    await expect(
      page.getByRole("heading", { name: "Sprints", level: 1 }),
    ).toBeVisible();
  } else if (options.view === "capture") {
    await expect(
      page.getByRole("button", { name: "Quick capture", exact: true }),
    ).toBeVisible();
  } else if (options.dashboard) {
    await expect(page.getByTestId("live-dashboard")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Project progress", exact: true })
        .getByRole("link", {
          name: new RegExp(board.name),
        }),
    ).toBeVisible();
  } else if (
    hash &&
    records.some(
      (record) =>
        record.id === hash.replace(/^#/, "") && record.type === "task",
    )
  ) {
    await expect(page.getByTestId("task-page")).toBeVisible();
  } else {
    await expect(page.getByTestId("live-board")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: board.name, exact: true }),
    ).toBeVisible();
  }
  return {
    setTeams: (next: TeamDto[]) => {
      teamRecords = next;
    },
    denyTeamAccess: () => {
      teamAccessDenied = true;
    },
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
