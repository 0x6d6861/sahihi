import path from "node:path"
import { defineConfig, devices } from "@playwright/test"
import { API_URL, serverEnv, WEB_PORT, WEB_URL, withEnv } from "./env"

const root = path.resolve(import.meta.dirname, "../..")

/**
 * End-to-end: sign-up → upload → place → send → sign (Mailpit) → certificate (docs/testing.md → E2E).
 * Starts its own api (4100), web (3100) and worker on the `sahihi_e2e` database.
 * Needs `bun run infra:up`, and no `bun run dev` running (Next allows one dev server per app).
 */
export default defineConfig({
  testDir: "tests",
  // *.e2e.ts, so a bare `bun test` never picks these up.
  testMatch: "**/*.e2e.ts",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun src/index.ts",
      cwd: path.join(root, "apps/api"),
      url: `${API_URL}/health`,
      env: withEnv(serverEnv),
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `bunx next dev --port ${WEB_PORT}`,
      cwd: path.join(root, "apps/web"),
      url: `${WEB_URL}/sign-in`,
      env: withEnv({ API_URL, NODE_ENV: "development" }),
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
