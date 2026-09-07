import { expect, test } from "@playwright/test";
const api = "http://127.0.0.1:3219";
test.beforeEach(async ({ context, request }) => {
  await request.get(`${api}/test/reset`);
  await context.addCookies([
    {
      name: "trevv_alpha.session_token",
      value: "local-fixture-only",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
});

test("first useful workspace records do not wait for 10,001 current or 10,000 unrelated records", async ({
  page,
  request,
}) => {
  test.setTimeout(45_000);
  await request.get(
    `${api}/test/reset?items=10001&unrelatedItems=10000&itemDelay=40`,
  );
  await page.goto("/app/workspaces/navigation-test/my-work");
  await expect(page.getByTestId("live-my-work")).toContainText(
    "Fixture task 0",
    { timeout: 4_000 },
  );
  await expect(page.locator('[data-records-loading="true"]')).toBeVisible();
  const early = (await (
    await request.get(`${api}/test/request-details`)
  ).json()) as Array<{ path: string; query: Record<string, string> }>;
  expect(
    early.filter((entry) => entry.path === "/api/v1/items").length,
  ).toBeLessThan(101);
  expect(
    early
      .filter((entry) => entry.path === "/api/v1/items")
      .every((entry) => entry.query.workspaceId === "workspace-one"),
  ).toBe(true);
  await expect(page.locator('[data-records-loading="true"]')).toHaveCount(0, {
    timeout: 25_000,
  });
  const complete = (await (
    await request.get(`${api}/test/request-details`)
  ).json()) as Array<{ path: string; query: Record<string, string> }>;
  expect(
    complete.filter((entry) => entry.path === "/api/v1/items"),
  ).toHaveLength(101);
  await page.waitForTimeout(5_200);
  const afterPoll = (await (
    await request.get(`${api}/test/requests`)
  ).json()) as string[];
  expect(afterPoll.filter((path) => path === "/api/v1/items")).toHaveLength(
    101,
  );
});

test("workspace revocation clears streamed records while a later item page is stalled", async ({
  page,
  request,
}) => {
  await request.get(`${api}/test/reset?items=250`);
  let secondPage = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/items?**", async (route) => {
    if (new URL(route.request().url()).searchParams.has("cursor")) {
      secondPage = true;
      await held;
    }
    await route.continue().catch(() => {});
  });
  try {
    await page.goto("/app/workspaces/navigation-test/my-work");
    await expect(page.getByTestId("live-my-work")).toContainText(
      "Fixture task 0",
    );
    expect(secondPage).toBe(true);
    await request.get(`${api}/test/access?denied=1`);
    await expect(
      page.getByText("Workspace not available", { exact: true }),
    ).toBeVisible({ timeout: 6_500 });
    await expect(page.getByText("Fixture task 0", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
  } finally {
    release();
  }
});

for (const legacy of [false, true])
  test(`account pages retain their cache and avoid whole-account item reads (legacy=${legacy})`, async ({
    page,
    request,
  }) => {
    await request.get(
      `${api}/test/reset?items=10001&unrelatedItems=10000${legacy ? "&legacy=1" : ""}`,
    );
    let invitationReads = 0;
    await page.route("**/api/v1/invitations", (route) => {
      invitationReads++;
      return route.fulfill({ json: [] });
    });
    await page.route("**/api/web/sessions", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.goto("/app/account/invitations");
    await expect(
      page.getByRole("heading", { name: "Invitations", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Loading invitations", { exact: false }),
    ).toHaveCount(0);
    await expect(page.locator('[data-live-state="stale"]')).toHaveCount(0);
    await page.locator(".avatar-button").click();
    await page
      .getByRole("menuitem", { name: "Sessions and sign-in", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sessions", exact: true }),
    ).toBeVisible();
    await page.locator(".avatar-button").click();
    await page
      .getByRole("menuitem", { name: "Organization invitations", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Invitations", exact: true }),
    ).toBeVisible();
    expect(invitationReads).toBe(1);
    await expect(page.locator('[data-live-state="stale"]')).toHaveCount(0);
    const paths = (await (
      await request.get(`${api}/test/requests`)
    ).json()) as string[];
    expect(
      paths.filter((path) =>
        [
          "/api/v1/items",
          "/api/v1/attention",
          "/api/v1/waiting",
          "/api/v1/sync/summary",
        ].includes(path),
      ),
    ).toEqual([]);
  });

test("legacy saved links redirect additively and unknown workspaces keep real HTML and RSC 404s", async ({
  request,
}) => {
  for (const [path, destination] of [
    ["/app/hubs", "/app/portfolio"],
    ["/app/hubs/navigation-test", "/app/workspaces/navigation-test"],
    [
      "/app/hubs/navigation-test/boards/board-one",
      "/app/workspaces/navigation-test/boards/board-one",
    ],
    [
      "/app/hubs/navigation-test/stakeholder",
      "/app/workspaces/navigation-test/stakeholder",
    ],
  ]) {
    const response = await request.get(path!, {
      maxRedirects: 0,
      headers: { cookie: "trevv_alpha.session_token=local-fixture-only" },
    });
    expect([307, 308]).toContain(response.status());
    expect(
      new URL(response.headers().location!, "http://127.0.0.1:3218").pathname,
    ).toBe(destination);
  }
  for (const path of [
    "/app/hubs/missing",
    "/app/hubs/missing/boards/board-one",
    "/app/hubs/missing/stakeholder",
  ]) {
    for (const rsc of [false, true]) {
      const response = await request.get(path + (rsc ? "?_rsc" : ""), {
        maxRedirects: 0,
        headers: rsc
          ? {
              cookie: "trevv_alpha.session_token=local-fixture-only",
              rsc: "1",
              accept: "text/x-component",
            }
          : {
              cookie: "trevv_alpha.session_token=local-fixture-only",
              accept: "text/html",
            },
      });
      expect(response.status()).toBe(404);
    }
  }
});

test("account caches retain stale rows on outage and clear them immediately on a confirmed read denial", async ({
  page,
}) => {
  let status = 200;
  const invitation = {
    id: "invitation-one",
    organizationId: "org-one",
    email: "cached-invitee@example.test",
    role: "member",
    status: "pending",
    deliveryStatus: "sent",
    version: 1,
    expiresAt: "2026-09-10T00:00:00.000Z",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
  await page.route("**/api/v1/invitations", (route) =>
    route.fulfill({
      status,
      json:
        status === 200
          ? [invitation]
          : {
              error: {
                message: status === 403 ? "Access denied" : "Temporary outage",
              },
            },
    }),
  );
  await page.goto("/app/account/invitations");
  const cachedRow = page.getByText(invitation.email, { exact: true });
  await expect(cachedRow).toBeVisible();
  status = 503;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("Temporary outage", { exact: true }),
  ).toBeVisible();
  await expect(cachedRow).toBeVisible();
  status = 403;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Access denied", { exact: true })).toBeVisible();
  await expect(cachedRow).toHaveCount(0);
  status = 200;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(cachedRow).toBeVisible();
});
