import path from "node:path"
import { defineConfig } from "@playwright/test"
import { withEnv } from "../env"
import { API_URL, serverEnv, WEB_PORT, WEB_URL } from "./env"

const root = path.resolve(import.meta.dirname, "../../..")

/**
 * Reference captures of the real app for the marketing site, whose coded screens are matched to
 * them (apps/website/docs/PRODUCT_UI.md). Builds a believable workspace through the real API and
 * UI, then captures each screen in light and dark into showcase/out/. Own stack (api 4200, web 3200, worker, DB sahihi_showcase_e2e).
 * Needs `bun run infra:up`, and no `bun run dev` of the web app running.
 *
 *   bun run --filter @sahihi/e2e showcase
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.showcase.ts",
  timeout: 900_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: "list",
  outputDir: "../test-results/showcase",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bun src/index.ts",
      cwd: path.join(root, "apps/api"),
      url: `${API_URL}/health`,
      env: withEnv(serverEnv),
      reuseExistingServer: Boolean(process.env.SHOWCASE_REUSE),
      timeout: 60_000,
    },
    {
      command: `bunx next dev --port ${WEB_PORT}`,
      cwd: path.join(root, "apps/web"),
      url: `${WEB_URL}/sign-in`,
      env: withEnv({ API_URL, NODE_ENV: "development" }),
      reuseExistingServer: Boolean(process.env.SHOWCASE_REUSE),
      timeout: 180_000,
    },
  ],
})
