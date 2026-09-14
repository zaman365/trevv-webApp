import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "../fixtures/live-workflow-browser";
import { teamWorkspaceApi } from "../fixtures/team-workspace-api";
import {
  item,
  snapshot,
} from "../../apps/web/test-fixtures/live-workflow-data";
import { issueSignals } from "../../apps/web/test-fixtures/attention-workspace-data";

async function start(
  page: Page,
  view: "portfolio" | "planning" | "teams" | "messages" | `page-${string}`,
) {
  const fixture = teamWorkspaceApi();
  const records = [
    { ...item, assignees: [{ id: "user-one", name: "Owner" }] },
    {
      ...item,
      id: "outside",
      workspaceId: "outside",
      title: "Other workspace secret",
      assignees: [{ id: "user-one", name: "Owner" }],
    },
    {
      ...item,
      id: "decision",
      type: "decision" as const,
      decisionState: "needed" as const,
      title: "Choose the launch",
    },
  ];
  const state = await setup(page, "", {
    view,
    styled: true,
    records,
    attention: issueSignals,
    api: fixture.api,
  });
  return { ...fixture, ...state };
}

for (const view of [
  "page-ideas",
  "page-attention",
  "page-my-work",
  "page-decisions",
  "page-approvals",
  "page-waiting",
  "page-search",
  "planning",
  "teams",
  "people",
  "messages",
  "portfolio",
  "calendar",
] as const) {
  test(`${view} keeps its topic and actions in a compact page header`, async ({
    page,
  }) => {
    const fixture = teamWorkspaceApi();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page, "", {
      view,
      styled: true,
      api: async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/calendar")) {
          await route.fulfill({
            json: {
              workspaceId: "workspace-one",
              range: {
                from: url.searchParams.get("from"),
                to: url.searchParams.get("to"),
              },
              calendars: [],
              events: [],
              providerAvailability: [],
            },
          });
          return true;
        }
        return fixture.api(route);
      },
    });
    const header = page.locator("main > header.compact-page-header").first();
    const heading = header.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    // Keep workspace labels and descriptions out of the topic row without
    // losing the page's actions or local navigation.
    await expect(header.locator(":scope > div:first-child")).toHaveText(
      await heading.innerText(),
    );
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(64);
    for (const action of await header.getByRole("button").all())
      await expect(action).toBeInViewport();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(heading).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("Portfolio retains workspace creation and adds searchable local sections", async ({
  page,
}) => {
  await start(page, "portfolio");
  const header = page.locator("main > header.compact-page-header");
  await expect(header.getByRole("heading", { level: 1 })).toHaveCSS(
    "font-size",
    "22px",
  );
  await expect(
    header.getByRole("button", { name: "Create Workspace", exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText("Fictional TREVV Preview Org");
  const tabs = page.getByRole("tablist", { name: "Portfolio sections" });
  await expect(tabs.getByRole("tab")).toHaveCount(12);
  await expect(page.getByTestId("workspace-card-launch")).toBeVisible();
  await page.getByTestId("create-workspace-open").click();
  await expect(page.getByTestId("create-workspace-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close workspace creation" }).click();
  await tabs.getByRole("tab", { name: "Workspaces", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Find a workspace" })
    .fill("missing");
  await expect(
    page.getByText("No workspaces match these filters.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Launch", exact: true }),
  ).toBeVisible();
  await tabs.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("workspace-card-launch")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("Portfolio workspace panels fetch scoped work and support real inline updates", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/items")
      calls.push(request.url());
  });
  const fixture = await start(page, "portfolio");
  await page
    .getByRole("tablist", { name: "Portfolio sections" })
    .getByRole("tab", { name: "My Work", exact: true })
    .click();
  const panel = page.getByRole("tabpanel", { name: "My Work", exact: true });
  await expect(page.getByLabel("Workspace for this section")).toHaveValue(
    "launch",
  );
  await expect(
    panel.getByRole("link", { name: /Ship the launch/ }),
  ).toBeVisible();
  await expect(panel).not.toContainText("Other workspace secret");
  await panel
    .getByLabel("Status for Ship the launch", { exact: true })
    .selectOption("working");
  await expect(panel).toContainText("Server confirmed");
  expect(fixture.transitions[0]).toMatchObject({ body: { status: "working" } });
  expect(
    calls.some(
      (url) => new URL(url).searchParams.get("workspaceId") === "workspace-one",
    ),
  ).toBe(true);
  await expect(
    panel.getByRole("link", { name: "Open My Work full page" }),
  ).toHaveAttribute("href", "/app/workspaces/launch/my-work");
});

test("Attention keeps issues and embeds decisions with drafts, history and reload support", async ({
  page,
}) => {
  await start(page, "page-attention");
  const tabs = page.getByRole("tablist", { name: "Attention sections" });
  await expect(
    page.getByRole("heading", { name: "Open signals" }),
  ).toBeVisible();
  await tabs.getByRole("tab", { name: "Decisions", exact: true }).click();
  await expect(
    page.getByText("Choose the launch", { exact: true }),
  ).toBeVisible();
  const draft = page.getByRole("textbox", { name: "Rationale", exact: true });
  await draft.fill("Keep the scope focused");
  await tabs.getByRole("tab", { name: "Approvals", exact: true }).click();
  await page.goBack();
  await expect(draft).toHaveValue("Keep the scope focused");
  await tabs.getByRole("tab", { name: "Waiting", exact: true }).click();
  await page.reload();
  await expect(
    tabs.getByRole("tab", { name: "Waiting", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "Attention", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Open signals" }),
  ).toBeVisible();
});

test("Teams keeps six cards in view below one heading and the shared tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_280, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__workflowManagedWorkspaceIds", {
      value: ["workspace-one"],
    });
  });
  const fixture = teamWorkspaceApi();
  const original = fixture.state.teams[0]!;
  fixture.state.teams = [
    "Customer Success",
    "Launch Team",
    "Marketing",
    "Operations",
    "Sales",
    "Technology",
  ].map((name, index) => ({
    ...structuredClone(original),
    id: `directory-team-${index}`,
    name: `${name} 9d341211`,
    purpose: `${name} coordination for the founder operating loop.`,
  }));
  await setup(page, "", {
    view: "teams",
    styled: true,
    api: fixture.api,
    workspaces: snapshot.workspaces.map((workspace) => ({
      ...workspace,
      name: "Operating Loop 9d341211",
    })),
  });
  // Match the production sidebar and topbar space; a full-width fixture alone
  // misses duplicated headers that push the second row below the fold.
  await page.addStyleTag({
    content: "body { padding: 68px 0 0 248px; }",
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Teams");
  await expect(page.getByRole("tablist")).toHaveCount(1);
  const cards = page.locator('[data-testid^="team-card-"]');
  await expect(cards).toHaveCount(6);
  for (const card of await cards.all()) await expect(card).toBeInViewport();
  await expect(cards.getByRole("button", { name: /^Manage / })).toHaveCount(6);
  await expect(page.getByTestId("create-team-open")).toBeInViewport();
  await expect(
    page.getByRole("link", { name: "People directory", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Invite people to Operating Loop 9d341211",
      exact: true,
    }),
  ).toBeVisible();
});

test("Teams embeds actionable People cards, projects and messages without nested page navigation", async ({
  page,
}) => {
  await start(page, "teams");
  const tabs = page.getByRole("tablist", { name: "Teams and people sections" });
  await expect(page.getByTestId("team-card-team-launch")).toBeVisible();
  await tabs.getByRole("tab", { name: "People", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open People full page" }),
  ).toHaveAttribute("href", "/app/workspaces/launch/people");
  await expect(
    page.getByRole("button", { name: "Chat", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await tabs.getByRole("tab", { name: "Projects", exact: true }).click();
  await page
    .getByRole("button", { name: "New project / plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Messages preserve their composer across local People and Inbox tabs", async ({
  page,
}) => {
  const fixture = await start(page, "messages");
  const tabs = page.getByRole("tablist", {
    name: "Messages sections",
    exact: true,
  });
  const composer = page.getByLabel("Message", { exact: true });
  await composer.fill("Ready for the next step");
  await tabs.getByRole("tab", { name: "People", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "People", exact: true }).first(),
  ).toBeVisible();
  await tabs.getByRole("tab", { name: "Messages", exact: true }).click();
  await expect(composer).toHaveValue("Ready for the next step");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(composer).toHaveValue("");
  expect(fixture.state.messageKeys).toHaveLength(1);
  await tabs.getByRole("tab", { name: "Inbox", exact: true }).click();
  await expect(page.getByRole("tab", { name: /Captured work/ })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
});

test("Shared tabs are keyboard accessible and fit mobile light and dark layouts", async ({
  page,
}) => {
  await start(page, "portfolio");
  const tabs = page.getByRole("tablist", { name: "Portfolio sections" });
  await tabs.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    tabs.getByRole("tab", { name: "Workspaces", exact: true }),
  ).toBeFocused();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute("data-theme", value),
      theme,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("portfolio-sections-mobile.png"),
    fullPage: true,
  });
});

test("Portfolio workspace selection excludes other portfolios, changes records and clears revoked access", async ({
  page,
}) => {
  const base = snapshot.workspaces[0]!;
  const workspaces = [
    base,
    { ...base, id: "research", slug: "research", name: "Research" },
    {
      ...base,
      id: "restricted",
      slug: "restricted",
      portfolioId: "another-portfolio",
      name: "Other portfolio",
    },
  ];
  const records = [
    { ...item, assignees: [{ id: "user-one", name: "Owner" }] },
    {
      ...item,
      id: "research-task",
      workspaceId: "research",
      title: "Explore alternatives",
      assignees: [{ id: "user-one", name: "Owner" }],
    },
  ];
  const fixture = teamWorkspaceApi();
  let denied = false;
  await setup(page, "", {
    view: "portfolio",
    records,
    workspaces,
    api: async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname === "/api/v1/items" &&
        denied &&
        url.searchParams.get("workspaceId") === "research"
      ) {
        await route.fulfill({
          status: 403,
          json: {
            error: { code: "forbidden", message: "Workspace access removed" },
          },
        });
        return true;
      }
      if (url.pathname === "/api/v1/workspaces/research/conversations") {
        await route.fulfill({ json: { data: [], nextCursor: null } });
        return true;
      }
      if (url.pathname === "/api/v1/workspaces/research/teams") {
        await route.fulfill({ json: { teams: [], availableMembers: [] } });
        return true;
      }
      if (
        url.pathname === "/api/v1/boards" &&
        url.searchParams.get("workspaceId") === "research"
      ) {
        await route.fulfill({ json: [] });
        return true;
      }
      return fixture.api(route);
    },
  });
  await page
    .getByRole("tablist", { name: "Portfolio sections" })
    .getByRole("tab", { name: "My Work", exact: true })
    .click();
  const select = page.getByLabel("Workspace for this section");
  await expect(select.locator("option")).toHaveCount(2);
  await select.selectOption("research");
  const panel = page.getByRole("tabpanel", { name: "My Work", exact: true });
  await expect(
    panel.getByRole("link", { name: /Explore alternatives/ }),
  ).toBeVisible();
  await expect(panel).not.toContainText("Ship the launch");
  await page.reload();
  await expect(select).toHaveValue("research");
  await expect(
    panel.getByRole("link", { name: "Open My Work full page" }),
  ).toHaveAttribute("href", "/app/workspaces/research/my-work");
  denied = true;
  await page.reload();
  await expect(
    panel.getByText("Workspace access changed", { exact: true }),
  ).toBeVisible();
  await expect(panel).not.toContainText("Explore alternatives");
  denied = false;
  await panel.getByRole("button", { name: "Refresh access" }).click();
  await expect(
    panel.getByRole("link", { name: /Explore alternatives/ }),
  ).toBeVisible();
});

test("Personal work retains organization-wide tasks and offers scoped companion sections", async ({
  page,
}) => {
  const fixture = teamWorkspaceApi();
  await setup(page, "", {
    view: "personal",
    api: fixture.api,
    records: [{ ...item, assignees: [{ id: "user-one", name: "Owner" }] }],
  });
  const tabs = page.getByRole("tablist", { name: "Personal work sections" });
  await page.getByRole("button", { name: /^All work / }).click();
  await expect(
    page.getByRole("link", { name: /Ship the launch/ }).first(),
  ).toBeVisible();
  await tabs.getByRole("tab", { name: "Messages", exact: true }).click();
  await expect(page.getByLabel("Workspace for this section")).toHaveValue(
    "launch",
  );
  await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
  await tabs.getByRole("tab", { name: "All my tasks", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Ship the launch/ }).first(),
  ).toBeVisible();
});

test("Calendar keeps schedule controls, selected views and creation while embedding work", async ({
  page,
}) => {
  const fixture = teamWorkspaceApi();
  await setup(page, "", {
    view: "calendar",
    api: async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/calendar")) {
        await route.fulfill({
          json: {
            workspaceId: "workspace-one",
            range: {
              from: url.searchParams.get("from"),
              to: url.searchParams.get("to"),
            },
            calendars: [],
            events: [],
            providerAvailability: [],
          },
        });
        return true;
      }
      return fixture.api(route);
    },
  });
  const tabs = page.getByRole("tablist", { name: "Schedule sections" });
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await tabs.getByRole("tab", { name: "My Work", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open My Work full page" }),
  ).toHaveAttribute("href", "/app/workspaces/launch/my-work");
  await tabs.getByRole("tab", { name: "Schedule", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Week", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
