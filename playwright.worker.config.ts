import { defineConfig, devices } from "@playwright/test";

// Exercise the deployed adapter, whose prefetch behavior differs from Next dev.
export default defineConfig({
  testDir: "./tests/worker",
  workers: 1,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3218" },
  webServer: [
    {
      command: "node tests/fixtures/navigation-api.mjs",
      url: "http://127.0.0.1:3219/test/requests",
      timeout: 30_000,
    },
    {
      // Use the production bundle with HTTP transport to a loopback-only fake
      // upstream; NODE_ENV=test only relaxes local runtime URL validation.
      command:
        "pnpm --filter @founderhq/web exec wrangler dev --local --port 3218 --var NODE_ENV:test --var API_ORIGIN:http://127.0.0.1:3219 --var NEXT_PUBLIC_APP_URL:https://trevv.test --var AUTH_COOKIE_PREFIX:trevv_alpha",
      url: "http://127.0.0.1:3218/api/web/livez",
      timeout: 60_000,
      env: { WRANGLER_LOG_PATH: "/tmp/trevv-worker-navigation.log" },
    },
  ],
});
