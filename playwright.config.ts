import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  trace: "on-first-retry",
  reporter: process.env.CI ? "github" : "list",
  // The mail adapter is backed by a single shared file (.tmp/mail.json);
  // parallel workers would race on it, so specs run serially.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run db:migrate && npm run build && node server.js",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      MAIL_ADAPTER: "file",
      MAIL_FILE_PATH: ".tmp/mail.json",
      BETTER_AUTH_SECRET: "e2e-test-secret-change-me",
    },
  },
});
