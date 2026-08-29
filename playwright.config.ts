import { defineConfig, devices } from "@playwright/test";

const webBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const apiOrigin = process.env.PLAYWRIGHT_API_ORIGIN ?? "http://127.0.0.1:8787";
const webUrl = new URL(webBaseUrl);

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
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DEMO_MODE: "true",
        PORT: new URL(apiOrigin).port || "8787",
        WEB_ORIGIN: webBaseUrl,
      },
    },
    {
      command: `pnpm --filter @founderhq/web exec next dev --webpack --hostname ${webUrl.hostname} --port ${webUrl.port || "3000"}`,
      url: `${webBaseUrl}/app/portfolio`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DEMO_MODE: "true",
        NEXT_PUBLIC_APP_URL: webBaseUrl,
        NEXT_PUBLIC_API_URL: `${apiOrigin}/api/v1`,
      },
    },
  ],
});
