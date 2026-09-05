import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/performance",
  workers: 1,
  use: { ...devices["Desktop Chrome"] },
  projects: [{ name: "chromium" }],
});
