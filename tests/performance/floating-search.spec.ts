import { expect, test } from "@playwright/test";
import { setup } from "../fixtures/live-workflow-browser";
import {
  item,
  snapshot,
  teams,
  timestamp,
} from "../../apps/web/test-fixtures/live-workflow-data";

test("floating search keeps context, filters results and opens matching pages", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await setup(page, "", {
    view: "personal",
    teams,
    api: async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v1/search") {
        const query = url.searchParams.get("q")!.toLowerCase();
        await route.fulfill({
          json: {
            items: item.title.toLowerCase().includes(query)
              ? [
                  item,
                  {
                    ...item,
                    id: "outside",
                    workspaceId: "outside",
                    title: "Launch elsewhere",
                  },
                ]
              : [],
            workspaces: query === "launch" ? snapshot.workspaces : [],
          },
        });
        return true;
      }
      if (url.pathname.endsWith("/conversations")) {
        await route.fulfill({
          json: {
            data: [
              {
                id: "launch-thread",
                organizationId: "org-one",
                portfolioId: "portfolio-one",
                workspaceId: item.workspaceId,
                title: "Launch discussion",
                purpose: "Launch coordination",
                kind: "workspace",
                visibility: "private",
                participants: [],
                unreadCount: 0,
                needsResponseCount: 0,
                retentionDays: 365,
                version: 1,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
            nextCursor: null,
          },
        });
        return true;
      }
      return false;
    },
  });
  const trigger = page.locator(".search-trigger");
  const startUrl = page.url();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search", exact: true });
  const input = dialog.getByRole("searchbox");
  await expect(input).toBeFocused();
  await expect(page).toHaveURL(startUrl);
  await page.screenshot({ path: testInfo.outputPath("search-initial.png") });
  await input.fill("launch");
  await expect(dialog.getByRole("status")).toHaveText("4 results");
  await expect(
    dialog.getByRole("link", { name: /Launch elsewhere/ }),
  ).toHaveCount(0);
  const categories = dialog.getByRole("group", { name: "Search categories" });
  await categories
    .getByRole("button", { name: "Tasks 1", exact: true })
    .click();
  await expect(
    dialog.getByRole("list", { name: "Search results" }).getByRole("link"),
  ).toHaveCount(1);
  await expect(
    dialog.getByRole("link", { name: /Ship the launch/ }),
  ).toHaveAttribute("href", "/app/workspaces/launch/tasks/item-one");
  await categories
    .getByRole("button", { name: "Threads 1", exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: /Launch discussion/ }),
  ).toHaveAttribute("href", "/app/workspaces/launch/messages#launch-thread");
  await categories.getByRole("button", { name: "All 4", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("search-results.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) =>
        element.getBoundingClientRect().right <= innerWidth &&
        element.getBoundingClientRect().bottom <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("search-mobile.png") });
  await input.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("link", { name: "Open full search page" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await trigger.click();
  await input.fill("launch");
  await dialog.getByRole("link", { name: "Open full search page" }).click();
  await expect(page).toHaveURL(
    "https://trevv.test/app/workspaces/launch/search?q=launch",
  );
  const fullSearch = page.getByRole("region", { name: "Search", exact: true });
  await expect(fullSearch.getByRole("searchbox")).toHaveValue("launch");
  // Next keeps the route mounted when only its search parameters change.
  await page.evaluate(() => {
    history.pushState(null, "", "?q=Teammate");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(fullSearch.getByRole("searchbox")).toHaveValue("Teammate");
  await expect(
    fullSearch.getByRole("link", { name: /Teammate/ }),
  ).toBeVisible();
  await page.evaluate(() => {
    history.pushState(null, "", "?q=launch");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await fullSearch.getByRole("link", { name: /Ship the launch/ }).click();
  await expect(page).toHaveURL(
    "https://trevv.test/app/workspaces/launch/tasks/item-one",
  );
});

test("new queries supersede delayed results and failed searches can be retried", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await setup(page, "", {
    view: "personal",
    api: async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== "/api/v1/search") return false;
      if (url.searchParams.get("q") === "old") await held;
      if (url.searchParams.get("q") === "broken" && fail)
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "service_unavailable",
              message: "Search unavailable",
            },
          },
        });
      else
        await route.fulfill({
          json: {
            items:
              url.searchParams.get("q") === "old"
                ? [{ ...item, title: "Obsolete result" }]
                : [],
            workspaces: [],
          },
        });
      return true;
    },
  });
  await page.locator(".search-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Search", exact: true });
  const input = dialog.getByRole("searchbox");
  const requested = page.waitForRequest((request) =>
    request.url().includes("/search?q=old"),
  );
  await input.fill("old");
  await requested;
  await input.fill("Teammate");
  await expect(dialog.getByRole("link", { name: /Teammate/ })).toBeVisible();
  const completed = page.waitForResponse((response) =>
    response.url().includes("/search?q=old"),
  );
  release();
  await completed;
  await expect(
    dialog.getByRole("link", { name: /Obsolete result/ }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: /Teammate/ })).toBeVisible();
  await input.fill("broken");
  await dialog.getByRole("button", { name: "Retry search" }).waitFor();
  fail = false;
  await dialog.getByRole("button", { name: "Retry search" }).click();
  await expect(
    dialog.getByRole("button", { name: "Retry search" }),
  ).toBeHidden();
  await expect(dialog).toContainText("No matches here");
});

test("demo search retains people actions, resource links and category counts", async ({
  page,
}) => {
  await setup(page, "&demoSearch=1", { view: "personal" });
  await page.locator(".search-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Search", exact: true });
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  await dialog.getByRole("searchbox").fill("Nora");
  await expect(
    dialog.getByRole("link", { name: "Message Nora Klein" }),
  ).toHaveAttribute("href", /messages\?person=/);
  await expect(
    dialog.getByRole("button", {
      name: "External email unavailable for Nora Klein",
    }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "People 1", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("searchbox").fill("Figma");
  await dialog
    .getByRole("button", { name: "Resources 1", exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: /Northstar storefront designs/ }),
  ).toHaveAttribute("href", "https://www.figma.com");
  await expect(
    dialog.getByRole("link", { name: "Open full search page" }),
  ).toHaveAttribute("href", "/app/workspaces/northstar-apparel/search?q=Figma");
  await dialog.getByRole("button", { name: "Close search" }).click();
  await expect(dialog).toBeHidden();
});
