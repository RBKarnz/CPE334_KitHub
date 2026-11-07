// End-to-end tests (SDS 10, #20): Chromium against the built app, as deployed (DD-01). The
// webServer step builds client/ and server/, then starts the server in production mode on a
// fixed port, so it serves the built UI and the API from one origin. The server uses
// kithub_test only: DATABASE_URL is replaced with the guarded TEST_DATABASE_URL.
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_PORT, TEST_DATABASE_URL } from "./e2e/support/env.js";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One shared database: tests run one at a time, and each starts from empty tables.
  fullyParallel: false,
  workers: 1,
  // No retries: a flaky test must be fixed, not hidden.
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    // Kept only when a test fails; both folders are git-ignored.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm --prefix client run build && npm --prefix server run build && node server/dist/index.js",
    url: `${BASE_URL}/api/ready`,
    // Always a fresh server on the test port, never a dev server that happens to be running.
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
    // NODE_ENV=production makes the session cookie Secure (COOKIE_SECURE defaults to true, SDS 9.1),
    // as on Cloud Run. Chromium still stores and sends a Secure cookie over plain http because it
    // treats localhost as a secure context. That exception is browser-specific: before adding a
    // Firefox or WebKit project, or a base URL that is not localhost or 127.0.0.1, check that
    // sign-in still works, or set COOKIE_SECURE: "false" here.
    env: {
      NODE_ENV: "production",
      PORT: String(E2E_PORT),
      DATABASE_URL: TEST_DATABASE_URL,
    },
  },
});
