import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

let script = "";
let connectionStyles = "";
let outputDirectory = "";
test.beforeAll(async () => {
  const webRequire = createRequire(resolve("apps/web/package.json"));
  const { build } = await import(webRequire.resolve("vite"));
  outputDirectory = await mkdtemp(resolve(tmpdir(), "trevv-responsiveness-"));
  await build({
    configFile: false,
    root: resolve("apps/web"),
    logLevel: "error",
    resolve: { alias: { "@": resolve("apps/web") } },
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    build: {
      outDir: outputDirectory,
      minify: false,
      lib: {
        entry: resolve("apps/web/test-fixtures/responsiveness.tsx"),
        formats: ["iife"],
        name: "Responsiveness",
        fileName: () => "harness.js",
      },
    },
  });
  script = await readFile(resolve(outputDirectory, "harness.js"), "utf8");
  connectionStyles =
    (await readFile("packages/design-tokens/src/tokens.css", "utf8")) +
    (
      await Promise.all(
        (await readdir(outputDirectory))
          .filter((name) => name.endsWith(".css"))
          .map((name) => readFile(resolve(outputDirectory, name), "utf8")),
      )
    ).join("\n") +
    "\n*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}";
});

const organization = {
  id: "org-one",
  name: "Original",
  slug: "original",
  role: "owner",
  timezone: "Europe/Berlin",
};
const scopedAccess = (workspaceIds = ["workspace-one"], revision = "one") => ({
  protocol: 1,
  revision,
  session: {
    user: {
      id: "user-one",
      role: "owner",
      email: "owner@example.test",
      name: "Owner",
      locale: "en",
    },
    organizationId: organization.id,
    organization,
    availableOrganizations: [organization],
    managedWorkspaceIds: [],
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
  portfolios: [
    {
      id: "portfolio-one",
      organizationId: organization.id,
      name: "Original",
      slug: "original",
      description: "",
      isDefault: true,
    },
  ],
  workspaces: workspaceIds.map((id) => ({
    id,
    portfolioId: "portfolio-one",
    slug: id,
    name: id,
    description: "",
    icon: "W",
    accent: "#5555aa",
    type: "business",
    stage: "idea",
    health: "on_track",
    healthNote: "",
    priority: "Normal",
    metrics: [],
    versionTag: "2026-09-07T10:00:00.000Z",
    updatedAt: "2026-09-07T10:00:00.000Z",
  })),
});

test("a first access check taking more than a second loads without a false stale warning", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-07T10:00:00Z") });
  let release!: () => void;
  let started = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://trevv.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (path !== "/api/v1/sync/status")
      throw new Error(`Unexpected request: ${path}`);
    started = true;
    await held;
    await route.fulfill({ json: scopedAccess() });
  });
  try {
    await page.goto("http://trevv.test/#account");
    await page.addScriptTag({ content: script });
    await expect.poll(() => started).toBe(true);
    await page.clock.runFor(1_500);
    await expect(page.locator("#stale")).toHaveText("false");
    release();
    await expect(page.locator("#clock")).toContainText("2026-09-07");
    await expect(page.locator("#stale")).toHaveText("false");
  } finally {
    release();
  }
});

test("adding a workspace preserves the mounted summary page and draft during refresh", async ({
  page,
}) => {
  let access = scopedAccess();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://trevv.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (path === "/api/v1/sync/status") return route.fulfill({ json: access });
    if (path === "/api/v1/sync/summary") {
      if (access.revision === "two") await held;
      return route.fulfill({
        json: {
          protocol: 1,
          revision: access.revision,
          portfolios: [],
          workspaces: access.workspaces.map(({ id }) => ({
            workspaceId: id,
            open: 0,
            blocked: 0,
            pendingDecisions: 0,
            attention: 0,
            attentionEntities: 0,
          })),
        },
      });
    }
    throw new Error(`Unexpected record read: ${path}`);
  });
  try {
    await page.goto("http://trevv.test/#scope");
    await page.addScriptTag({ content: script });
    await expect(page.locator("#summary-workspaces")).toHaveText("1");
    await page
      .getByRole("textbox", { name: "Draft" })
      .fill("Keep after create");
    access = scopedAccess(["workspace-one", "workspace-created"], "two");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator("#workspace-ids")).toHaveText(
      "workspace-one,workspace-created",
    );
    await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue(
      "Keep after create",
    );
    await expect(page.locator("#summary-workspaces")).toHaveText("1");
    release();
    await expect(page.locator("#summary-workspaces")).toHaveText("2");
    await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue(
      "Keep after create",
    );
  } finally {
    release();
  }
});

for (const legacy of [false, true])
  test(`account freshness follows access checks without record reads and still reports outages (legacy=${legacy})`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-09-07T10:00:00Z") });
    const access = scopedAccess();
    let status = 200;
    let checks = 0;
    await page.route("http://trevv.test/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/")
        return route.fulfill({
          contentType: "text/html",
          body: '<div id="root"></div>',
        });
      if (legacy && path === "/api/v1/sync/status")
        return route.fulfill({ status: 501, json: {} });
      if (path === (legacy ? "/api/v1/session" : "/api/v1/sync/status"))
        checks++;
      const body =
        path === "/api/v1/sync/status"
          ? access
          : path === "/api/v1/session"
            ? access.session
            : path === "/api/v1/portfolios"
              ? access.portfolios
              : path === "/api/v1/workspaces"
                ? access.workspaces
                : undefined;
      if (!body) throw new Error(`Unexpected record read: ${path}`);
      return route.fulfill({
        status,
        json:
          status === 200
            ? body
            : {
                error: { code: "unavailable", message: "Test access failure" },
              },
      });
    });
    await page.goto("http://trevv.test/#account");
    await page.addScriptTag({ content: script });
    await expect(page.locator("#clock")).toContainText("2026-09-07");
    for (let poll = 0; poll < 4; poll++) {
      const before = checks;
      const previousCheck = await page.locator("#clock").textContent();
      await page.clock.fastForward(5_000);
      await expect.poll(() => checks).toBeGreaterThan(before);
      await expect(page.locator("#clock")).not.toHaveText(previousCheck!);
      await expect(page.locator("#stale")).toHaveText("false");
    }
    const lastSuccessfulCheck = await page.locator("#clock").textContent();
    status = 503;
    await page.clock.fastForward(5_000);
    await expect(page.locator("#stale")).toHaveText("true");
    await expect(page.locator("#clock")).toHaveText(lastSuccessfulCheck!);
    status = 200;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator("#stale")).toHaveText("false");
    status = 403;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByText("Your access has changed", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Draft" })).toHaveCount(0);
  });

test("navigation without a new snapshot keeps cached records and drafts, while identity changes fetch afresh", async ({
  page,
}) => {
  let requests = 0;
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("http://trevv.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    requests++;
    await paused;
    const body =
      url.pathname === "/api/v1/portfolios"
        ? [
            {
              id: "portfolio-two",
              organizationId: "org-two",
              name: "Second identity",
              slug: "second",
              description: "",
              isDefault: true,
            },
          ]
        : url.pathname === "/api/v1/items"
          ? { data: [], nextCursor: null }
          : [];
    await route.fulfill({ json: body });
  });
  await page.goto("http://trevv.test/");
  await page.addScriptTag({ content: script });
  await page
    .getByRole("textbox", { name: "Draft" })
    .fill("Keep while navigating");
  await page.getByRole("button", { name: "Navigate without seed" }).click();
  await expect(page.locator("#records")).toHaveText("Original");
  await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue(
    "Keep while navigating",
  );
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Change identity" }).click();
  await expect(
    page.getByRole("main", { name: "Loading your workspace", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#records")).toHaveCount(0);
  release();
  await expect(page.locator("#records")).toHaveText("Second identity");
  await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue("");
});

test("a cold navigation fetch failure has retry and never renders a fake empty success", async ({
  page,
}) => {
  let status = 429;
  await page.route("http://trevv.test/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    return route.fulfill({
      status,
      json:
        status === 429
          ? { error: { code: "rate_limited", message: "Try again" } }
          : url.pathname === "/api/v1/items"
            ? { data: [], nextCursor: null }
            : [],
    });
  });
  await page.goto("http://trevv.test/#cold-navigation");
  await page.addScriptTag({ content: script });
  await expect(
    page.getByText("Unable to load your workspace", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#records")).toHaveCount(0);
  status = 200;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator("#access")).toHaveText("active");
});
test.afterAll(async () => {
  if (outputDirectory)
    await rm(outputDirectory, { recursive: true, force: true });
});

test("unchanged polls preserve renders and drafts while updates and access loss still propagate", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-05T10:00:00Z") });
  let name = "Original";
  let status = 200;
  let polls = 0;
  await page.route("http://trevv.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (url.pathname === "/api/v1/portfolios") polls++;
    const body =
      status !== 200
        ? {
            error: {
              code: status === 403 ? "forbidden" : "unavailable",
              message: "Test response",
            },
          }
        : url.pathname === "/api/v1/portfolios"
          ? [
              {
                id: "portfolio-one",
                organizationId: "org-one",
                name,
                slug: "original",
                description: "",
                isDefault: true,
              },
            ]
          : url.pathname === "/api/v1/items"
            ? { data: [], nextCursor: null }
            : [];
    await route.fulfill({ status, json: body });
  });
  await page.goto("http://trevv.test/");
  await page.addScriptTag({ content: script });
  await expect(page.locator("#records")).toHaveText("Original");
  await page.getByRole("textbox", { name: "Draft" }).fill("Keep this draft");
  const initial = await page.evaluate(() => ({
    ...(window as unknown as { performanceCommits: Record<string, number> })
      .performanceCommits,
  }));
  const initialClock = await page.locator("#clock").textContent();
  for (let index = 0; index < 3; index++) {
    await page.clock.fastForward(5_000);
    await expect.poll(() => polls).toBe(index + 1);
    await expect(page.locator("#clock")).not.toHaveText(initialClock!);
    // Flush query observer notifications before comparing render counts.
    await page.clock.runFor(50);
  }
  const unchanged = await page.evaluate(() => ({
    ...(window as unknown as { performanceCommits: Record<string, number> })
      .performanceCommits,
  }));
  expect(unchanged.records).toBe(initial.records);
  expect(unchanged.workspace).toBe(initial.workspace);
  await expect(page.getByRole("textbox")).toHaveValue("Keep this draft");
  name = "Changed";
  await page.clock.fastForward(5_000);
  await expect(page.locator("#records")).toHaveText("Changed");
  status = 403;
  await page.clock.fastForward(5_000);
  await expect(page.locator("#access")).toHaveText("lost");
  await expect(page.locator("#records")).toHaveText("");
  status = 200;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("#records")).toHaveText("Changed");
  await expect(page.locator("#stale")).toHaveText("false");
  console.log(
    JSON.stringify({
      unchangedPolls: 3,
      recordCommits: unchanged.records! - initial.records!,
      workspaceCommits: unchanged.workspace! - initial.workspace!,
    }),
  );
});

test("unrelated storage events do not repaint workspace data and blocked storage preserves local creation", async ({
  page,
}) => {
  await page.route("http://trevv.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("http://trevv.test/");
  await page.addScriptTag({ content: script });
  await expect(
    page.getByRole("button", { name: "Create local workspace" }),
  ).toBeVisible();
  const before = await page.evaluate(
    () =>
      (window as unknown as { performanceCommits: { storage: number } })
        .performanceCommits.storage,
  );
  await page.evaluate(() => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "unrelated-draft",
        storageArea: localStorage,
        newValue: "updated",
      }),
    );
  });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { performanceCommits: { storage: number } })
          .performanceCommits.storage,
    ),
  ).toBe(before);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Create local workspace" }).click();
  await expect(page.locator("#storage")).toHaveText("Local draft");
});

test("switching conversations never presents the old room under the new selection", async ({
  page,
}) => {
  let releaseSecond: () => void = () => {};
  const secondReady = new Promise<void>((resolveReady) => {
    releaseSecond = resolveReady;
  });
  await page.route("http://trevv.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (path.endsWith("room-two")) await secondReady;
    const id = path.endsWith("room-two") ? "room-two" : "room-one";
    await route.fulfill({
      json: {
        id,
        organizationId: "org-one",
        portfolioId: "portfolio-one",
        workspaceId: "workspace-one",
        title: id,
        purpose: "",
        kind: "workspace",
        visibility: "organization",
        participants: [],
        unreadCount: 0,
        needsResponseCount: 0,
        retentionDays: 365,
        version: 1,
        createdAt: "2026-09-05T10:00:00Z",
        updatedAt: "2026-09-05T10:00:00Z",
      },
    });
  });
  await page.goto("http://trevv.test/#conversation");
  await page.addScriptTag({ content: script });
  await expect(page.locator("#conversation")).toHaveText("room-one");
  await page.getByLabel("Conversation").selectOption("room-two");
  await expect(page.locator("#conversation")).toHaveText("Loading");
  releaseSecond();
  await expect(page.locator("#conversation")).toHaveText("room-two");
  await page.getByLabel("Conversation").selectOption("room-one");
  await expect(page.locator("#conversation")).toHaveText("room-one");
});

test("persistent collaboration pauses while hidden, reconciles on return, and resets cursor for another identity", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("http://trevv.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    return route.fulfill({
      json: path === "/api/v1/items" ? { data: [], nextCursor: null } : [],
    });
  });
  await page.goto("http://trevv.test/#events");
  await page.evaluate(() => {
    const streams: Array<{
      url: string;
      closed: boolean;
      emit(type: string, data: object): void;
    }> = [];
    Object.assign(window, { fixtureStreams: streams });
    class Source {
      url: string;
      closed = false;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      listeners = new Map<string, EventListener>();
      constructor(url: string) {
        this.url = String(url);
        streams.push(this);
      }
      close() {
        this.closed = true;
      }
      addEventListener(type: string, listener: EventListener) {
        this.listeners.set(type, listener);
      }
      emit(type: string, data: object) {
        this.listeners.get(type)?.(
          new MessageEvent(type, { data: JSON.stringify(data) }),
        );
      }
    }
    Object.assign(window, { EventSource: Source });
  });
  await page.addScriptTag({ content: script });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { fixtureStreams: unknown[] }).fixtureStreams
            .length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Navigate without seed" }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { fixtureStreams: unknown[] }).fixtureStreams
          .length,
    ),
  ).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(6_000);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { fixtureStreams: { closed: boolean }[] }
      ).fixtureStreams.map((stream) => stream.closed),
    ),
  ).toEqual([true]);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { fixtureStreams: unknown[] }).fixtureStreams
            .length,
      ),
    )
    .toBe(2);
  await page.evaluate(() =>
    (
      window as unknown as {
        fixtureStreams: Array<{ emit(type: string, data: object): void }>;
      }
    ).fixtureStreams[1]!.emit("checkpoint", { nextCursor: 15 }),
  );
  await page.clock.fastForward(2_100);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { fixtureStreams: unknown[] }).fixtureStreams
            .length,
      ),
    )
    .toBe(3);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { fixtureStreams: Array<{ url: string }> })
          .fixtureStreams[2]!.url,
    ),
  ).toContain("after=15");
  await page.getByRole("button", { name: "Change identity" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { fixtureStreams: unknown[] }).fixtureStreams
            .length,
      ),
    )
    .toBe(4);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { fixtureStreams: Array<{ url: string }> })
          .fixtureStreams[3]!.url,
    ),
  ).toContain("after=0");
});

async function connectionHarness(
  page: import("@playwright/test").Page,
  options: { status?: number; clock?: boolean; header?: boolean } = {},
) {
  if (options.clock !== false)
    await page.clock.install({ time: new Date("2026-09-09T09:00:00Z") });
  const state = { status: options.status ?? 200, checks: 0 };
  await page.route("http://trevv.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    if (path !== "/api/v1/sync/status")
      throw new Error(`Unexpected read: ${path}`);
    state.checks++;
    return route.fulfill({
      status: state.status,
      json:
        state.status === 200
          ? scopedAccess()
          : {
              error: {
                code: "test_refresh_failure",
                message: "The background read could not complete.",
              },
            },
    });
  });
  await page.goto(
    `http://trevv.test/#${options.header === false ? "account" : "header"}`,
  );
  await page.addScriptTag({ content: script });
  await page.addStyleTag({ content: connectionStyles });
  await expect.poll(() => state.checks).toBeGreaterThan(0);
  if (state.status === 200)
    await expect(page.locator("[data-sync-status]")).toHaveAttribute(
      "data-sync-status",
      "connected",
    );
  return state;
}

test("intermittent background failures keep one stable connection indicator and preserve drafts", async ({
  page,
}) => {
  const state = await connectionHarness(page);
  const connection = page.getByRole("group", { name: "Workspace connection" });
  await expect(connection).toHaveCount(1);
  const header = page.getByTestId("connection-header");
  const headerBounds = (await header.boundingBox())!;
  const connectionBounds = (await connection.boundingBox())!;
  expect(headerBounds.height).toBe(58);
  expect(connectionBounds.y).toBeGreaterThanOrEqual(headerBounds.y);
  expect(connectionBounds.y + connectionBounds.height).toBeLessThanOrEqual(
    headerBounds.y + headerBounds.height,
  );
  const draft = page.getByRole("textbox", { name: "Draft" });
  await draft.fill("Keep while background reads retry");
  const initial = await draft.boundingBox();
  for (let cycle = 0; cycle < 3; cycle++) {
    state.status = 503;
    await page.clock.fastForward(5_000);
    await expect(page.locator("#stale")).toHaveText("true");
    await expect(connection).toHaveAttribute("data-sync-status", "checking");
    await expect(connection.getByRole("status")).toHaveText("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect((await draft.boundingBox())?.y).toBe(initial?.y);
    state.status = 200;
    await page.clock.fastForward(5_000);
    await expect(connection).toHaveAttribute("data-sync-status", "connected");
    await expect(connection.getByRole("status")).toHaveText("");
  }
  await expect(draft).toHaveValue("Keep while background reads retry");
  expect((await draft.boundingBox())?.y).toBe(initial?.y);
});

test("a sustained outage remains visible with read-error details and manual recovery without layout shifts", async ({
  page,
}) => {
  const state = await connectionHarness(page);
  const connection = page.getByRole("group", { name: "Workspace connection" });
  const draft = page.getByRole("textbox", { name: "Draft" });
  const initial = await draft.boundingBox();
  state.status = 503;
  await page.clock.fastForward(5_000);
  await expect(connection).toHaveAttribute("data-sync-status", "checking");
  await connection.locator("summary").click();
  await expect(connection).toContainText(
    "Your last loaded records and drafts are kept.",
  );
  await expect(connection).not.toContainText(
    "no business change has been saved",
  );
  expect((await draft.boundingBox())?.y).toBe(initial?.y);
  await page.clock.runFor(10_100);
  await expect(connection).toHaveAttribute("data-sync-status", "interrupted");
  await expect(connection.getByRole("status")).toHaveText("Updates delayed");
  expect((await draft.boundingBox())?.y).toBe(initial?.y);
  state.status = 200;
  await connection.getByRole("button", { name: "Refresh connection" }).click();
  await expect(connection).toHaveAttribute("data-sync-status", "connected");
  await expect(connection.locator("details")).toHaveAttribute("open", "");
  expect((await draft.boundingBox())?.y).toBe(initial?.y);
});

test("access revocation bypasses the background warning grace period immediately", async ({
  page,
}) => {
  const state = await connectionHarness(page);
  state.status = 503;
  await page.clock.fastForward(5_000);
  await expect(page.locator("[data-sync-status]")).toHaveAttribute(
    "data-sync-status",
    "checking",
  );
  state.status = 403;
  await page
    .getByRole("group", { name: "Workspace connection" })
    .locator("summary")
    .click();
  await page.getByRole("button", { name: "Refresh connection" }).click();
  await expect(
    page.getByText("Your access has changed", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Draft" })).toHaveCount(0);
  await expect(page.locator("[data-sync-status]")).toHaveAttribute(
    "data-sync-status",
    "access-lost",
  );
});

test("hidden-tab expiry does not raise a warning on return while its access check recovers", async ({
  page,
}) => {
  await connectionHarness(page);
  const connection = page.getByRole("group", { name: "Workspace connection" });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
  await page.clock.fastForward(30_000);
  await expect(connection.getByRole("status")).toHaveText("");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
  await page.clock.runFor(50);
  await expect(connection.getByRole("status")).toHaveText("");
  await expect(connection).toHaveAttribute("data-sync-status", "connected");
});

test("an initial connection failure is reported without the background grace period", async ({
  page,
}) => {
  await connectionHarness(page, { status: 503 });
  await expect(page.locator("[data-sync-status]")).toHaveAttribute(
    "data-sync-status",
    "interrupted",
  );
  await expect(
    page
      .getByRole("group", { name: "Workspace connection" })
      .getByRole("status"),
  ).toHaveText("Updates delayed");
});

test("connection details are accessible in both themes and stay within a narrow viewport", async ({
  page,
}, testInfo) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await connectionHarness(page, { clock: false });
  await page.setViewportSize({ width: 320, height: 740 });
  const connection = page.getByRole("group", { name: "Workspace connection" });
  await connection.locator("summary").click();
  await expect(
    connection.getByText("Authenticated preview", { exact: true }),
  ).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: testInfo.outputPath(`connection-${theme}.png`),
    });
    const result = await new AxeBuilder({ page })
      .include("[data-sync-status]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    // Axe compares all underlying element stacks across wrapped lines, even
    // beneath an opaque floating panel. Independently verify that paragraph's
    // actual foreground/background and painted text instead of ignoring it.
    for (const issue of result.incomplete) {
      expect(issue.id).toBe("color-contrast");
      expect(issue.nodes.map((node) => node.target)).toEqual([["p"]]);
      expect(issue.nodes[0].any[0].data.messageKey).toBe(
        "elmPartiallyObscuring",
      );
    }
    const paragraph = await connection
      .locator("details p")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const range = document.createRange();
        range.selectNodeContents(element);
        return {
          foreground: style.color,
          background: style.backgroundColor,
          opacity: style.opacity,
          unobscured: [...range.getClientRects()].every((rect) => {
            const top = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            return top === element || (top && element.contains(top));
          }),
        };
      });
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.map(Number);
      expect(channels.length === 3 || channels[3] === 1).toBe(true);
      const [r, g, b] = channels.slice(0, 3).map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const foreground = luminance(paragraph.foreground),
      background = luminance(paragraph.background);
    expect(
      (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
    expect(paragraph.opacity).toBe("1");
    expect(paragraph.unobscured).toBe(true);
  }
  await page.context().setOffline(true);
  await expect(connection).toHaveAttribute("data-sync-status", "offline");
  await expect(
    connection.getByRole("button", { name: "Refresh connection" }),
  ).toBeDisabled();
  await page.context().setOffline(false);
  await connection.locator("summary").click();
  await expect(connection.locator("details")).not.toHaveAttribute("open");
});

test("standalone views retain one connection bar with details and direct retry", async ({
  page,
}) => {
  await connectionHarness(page, { header: false });
  const connection = page.getByRole("group", { name: "Workspace connection" });
  await expect(connection).toHaveCount(1);
  await expect(
    connection.getByText("Up to date", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    connection.getByRole("button", { name: "Refresh connection" }),
  ).toBeEnabled();
  await connection.getByText("Connection details", { exact: true }).click();
  await expect(
    connection.getByText(/The latest workspace updates have been checked/),
  ).toBeVisible();
});
