import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One worker: login is rate-limited per email and IP, and the signed-in specs share accounts.
  workers: 1,
  reporter: "list",
  // Traces, videos and screenshots land here (git-ignored); signed-in sessions live in e2e/.auth/ (git-ignored).
  outputDir: "test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
  },
  // PLAYWRIGHT_CHANNEL=msedge uses the installed Edge when Playwright's own browsers aren't downloaded.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
