import { defineConfig, devices } from "@playwright/test";

const webBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "pnpm --filter @founderhq/api dev",
      url: "http://127.0.0.1:8787/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { DEMO_MODE: "true", WEB_ORIGIN: "http://127.0.0.1:3100" },
    },
    {
      command:
        "pnpm --filter @founderhq/web exec next dev --hostname 127.0.0.1 --port 3100",
      url: `${webBaseUrl}/app/portfolio`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:8787/api/v1" },
    },
  ],
});
