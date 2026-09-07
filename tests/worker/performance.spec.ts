import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, request }) => {
  await request.get(
    "http://127.0.0.1:3219/test/reset?items=100&unrelatedItems=10000",
  );
  await context.addCookies([
    {
      name: "trevv_alpha.session_token",
      value: "local-fixture-only",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
});

test("the compiled Worker reports sampled navigation timing without customer identifiers", async ({
  page,
}) => {
  const reports: Record<string, unknown>[] = [];
  const accepted: number[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/web/vitals" &&
      request.method() === "POST"
    )
      reports.push(request.postDataJSON());
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/web/vitals")
      accepted.push(response.status());
  });
  await page.goto("/app/workspaces/navigation-test/my-work");
  await expect(
    page.getByRole("heading", { name: "My Work", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Calendar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Navigation calendar/ }),
  ).toBeVisible();
  await expect
    .poll(() =>
      reports.some(
        (entry) =>
          entry.name === "ROUTE_READY" &&
          entry.surface === "/app/workspaces/:workspace/calendar",
      ),
    )
    .toBe(true);
  await expect
    .poll(() => reports.some((entry) => entry.name === "ROUTE_COMMIT"))
    .toBe(true);
  await expect
    .poll(() => accepted.filter((status) => status === 204).length)
    .toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(reports)).not.toContain("navigation-test");
  expect(JSON.stringify(reports)).not.toContain("user-one");
  expect(JSON.stringify(reports)).not.toContain("Fixture task");
});

for (const profile of ["desktop", "mobile"] as const) {
  test(`cached page switches meet the local ${profile} navigation budget over 30 samples per route`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(180_000);
    // This accelerated loop deliberately emits more reports than the production
    // ingestion quota permits. Keep timing events and app requests intact, but
    // use a telemetry sink here; the separate test above verifies real ingestion.
    await page.route("**/api/web/vitals", (route) =>
      route.fulfill({ status: 204 }),
    );
    const client = await context.newCDPSession(page);
    if (profile === "mobile") {
      await page.setViewportSize({ width: 390, height: 844 });
      await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 1_600_000 / 8,
        uploadThroughput: 750_000 / 8,
      });
    } else {
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 50,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
    await page.addInitScript(() => {
      const state = window as unknown as {
        routeSamples: { name: string; value: number; path: string }[];
      };
      state.routeSamples = [];
      window.addEventListener("trevv:navigation-metric", ((
        event: CustomEvent<{ name: string; value: number }>,
      ) => {
        state.routeSamples.push({
          ...event.detail,
          path: window.location.pathname,
        });
      }) as EventListener);
    });
    await page.goto("/app/workspaces/navigation-test/my-work");
    await expect(
      page.getByRole("heading", { name: "My Work", exact: true }),
    ).toBeVisible();
    const destinations = [
      { label: "Calendar", path: "/app/workspaces/navigation-test/calendar" },
      { label: "Portfolio", path: "/app/portfolio" },
      { label: "My Work", path: "/app/workspaces/navigation-test/my-work" },
    ];
    const samples = Object.fromEntries(
      destinations.map(({ label }) => [label, [] as number[]]),
    );
    for (let round = 0; round < 31; round++) {
      for (const destination of destinations) {
        if (profile === "mobile")
          await page
            .getByRole("button", { name: "Open navigation", exact: true })
            .click();
        await page.evaluate(() => {
          (window as unknown as { routeSamples: unknown[] }).routeSamples = [];
        });
        await page
          .getByRole("navigation", { name: "Primary navigation" })
          .getByRole("link", { name: destination.label, exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
        const value = () =>
          page.evaluate(
            (path) =>
              (
                window as unknown as {
                  routeSamples: { name: string; value: number; path: string }[];
                }
              ).routeSamples.find(
                (sample) =>
                  sample.name === "ROUTE_READY" && sample.path === path,
              )?.value,
            destination.path,
          );
        await expect.poll(value).toBeGreaterThan(0);
        if (round > 0) samples[destination.label]!.push((await value())!);
      }
    }
    const measurements = Object.fromEntries(
      Object.entries(samples).map(([route, values]) => {
        const ordered = values.toSorted((left, right) => left - right);
        return [
          route,
          {
            count: ordered.length,
            p50: ordered[14],
            p95: ordered[28],
            max: ordered[29],
          },
        ];
      }),
    );
    await testInfo.attach(`navigation-${profile}.json`, {
      body: JSON.stringify(
        {
          environment:
            "local compiled Worker, loopback fictional API; telemetry POSTs intercepted to respect ingestion quota",
          profile,
          rttMs: profile === "mobile" ? 150 : 50,
          cpuSlowdown: profile === "mobile" ? 4 : 1,
          measurements,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    console.log(`Navigation ${profile}:`, measurements);
    for (const measurement of Object.values(measurements))
      expect(measurement.p95).toBeLessThanOrEqual(
        profile === "mobile" ? 1000 : 500,
      );
  });
}
