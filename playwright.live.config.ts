import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const webOrigin = "http://127.0.0.1:3200";
const apiOrigin = "http://127.0.0.1:8887";
const databaseUrl = process.env.LIVE_E2E_DATABASE_URL?.trim();
if (!databaseUrl)
  throw new Error(
    "LIVE_E2E_DATABASE_URL is required and must name an isolated migrated PostgreSQL test database.",
  );

const mailSinkFile =
  process.env.LIVE_E2E_MAIL_SINK_FILE?.trim() ||
  join(tmpdir(), `trevv-live-e2e-mail-${process.pid}.jsonl`);
process.env.LIVE_E2E_MAIL_SINK_FILE = mailSinkFile;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["live-identity.spec.ts", "live-founder-loop.spec.ts"],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: webOrigin,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "live-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @founderhq/api exec tsx src/index.ts",
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: "8887",
        NODE_ENV: "test",
        DEMO_MODE: "false",
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: "live-e2e-only-secret-with-more-than-32-characters",
        BETTER_AUTH_URL: apiOrigin,
        WEB_ORIGIN: webOrigin,
        MAIL_FROM: "no-reply@trevv.test",
        MAIL_SINK_FILE: mailSinkFile,
        TRUSTED_CLIENT_IP_HEADER: "x-trevv-client-ip",
      },
    },
    {
      command:
        "pnpm --filter @founderhq/web exec next dev --webpack --hostname 127.0.0.1 --port 3200",
      url: `${webOrigin}/sign-up`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DEMO_MODE: "false",
        API_ORIGIN: apiOrigin,
        BETTER_AUTH_URL: apiOrigin,
        NEXT_PUBLIC_APP_URL: webOrigin,
        TRUSTED_CLIENT_IP_HEADER: "x-trevv-client-ip",
      },
    },
  ],
});
