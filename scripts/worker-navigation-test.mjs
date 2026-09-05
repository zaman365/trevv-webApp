import { spawnSync } from "node:child_process";

const environment = {
  ...process.env,
  NODE_ENV: "production",
  DEMO_MODE: "false",
  REGISTRATION_MODE: "invite_only",
  NEXT_PUBLIC_APP_URL: "https://trevv.test",
  API_ORIGIN: "https://api.trevv.test",
  CSP_MODE: "report-only",
  HSTS_ENABLED: "false",
  AUTH_COOKIE_PREFIX: "trevv_alpha",
  RELEASE_METADATA_REQUIRED: "true",
  RELEASE_ID: "worker-navigation-test-only",
  RELEASE_GIT_SHA: "0".repeat(40),
  RELEASE_IMAGE_ID: `sha256:${"0".repeat(64)}`,
  WRANGLER_LOG_PATH: "/tmp/trevv-worker-navigation-build.log",
};
for (const args of [
  ["--filter", "@founderhq/web", "build:cloudflare"],
  ["exec", "playwright", "test", "--config=playwright.worker.config.ts"],
]) {
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
