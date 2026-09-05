import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, request }) => {
  await request.get("http://127.0.0.1:3219/test/reset");
  await context.addCookies([
    {
      name: "trevv_alpha.session_token",
      value: "local-fixture-only",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
});

test("visible links and navigation intent do not flood the API with unusable RSC prefetches", async ({
  page,
}) => {
  const rscRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.headers().rsc === "1" ||
      request.headers().accept?.includes("text/x-component")
    )
      rscRequests.push(new URL(request.url()).pathname);
  });
  await page.goto("/app/workspaces/navigation-test/my-work");
  await expect(
    page.getByRole("heading", { name: "My Work", exact: true }),
  ).toBeVisible();
  // A fixed observation window catches the adapter's viewport/idle prefetch queue.
  await page.waitForTimeout(1_500);
  console.log("Idle RSC requests:", rscRequests.length, rscRequests);
  expect(rscRequests).toEqual([]);
  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  const calendar = navigation.getByRole("link", {
    name: "Calendar",
    exact: true,
  });
  await calendar.hover();
  await calendar.focus();
  await page.waitForTimeout(300);
  expect(rscRequests).toEqual([]);
  await calendar.click();
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Navigation calendar", exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Loading your schedule…", { exact: true }),
  ).toHaveCount(0);
  expect(rscRequests).toEqual(["/app/workspaces/navigation-test/calendar"]);
  await navigation.getByRole("link", { name: "My Work", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My Work", exact: true }),
  ).toBeVisible();
  expect(rscRequests).toEqual([
    "/app/workspaces/navigation-test/calendar",
    "/app/workspaces/navigation-test/my-work",
  ]);
  await navigation
    .getByRole("link", { name: "Portfolio", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/portfolio$/);
  await page.waitForTimeout(1_500);
  expect(rscRequests).toHaveLength(3);
});

test("document and RSC requests retain current workspace denial and true 404 status", async ({
  request,
}) => {
  await request.get("http://127.0.0.1:3219/test/reset?denied=1");
  for (const accept of ["text/html", "text/x-component"]) {
    const response = await request.get(
      `/app/workspaces/navigation-test/my-work${accept === "text/x-component" ? "?_rsc" : ""}`,
      {
        maxRedirects: 0,
        headers: {
          cookie: "trevv_alpha.session_token=local-fixture-only",
          accept,
          ...(accept === "text/x-component" ? { rsc: "1" } : {}),
        },
      },
    );
    expect(response.status()).toBe(404);
  }
});
