import { execFileSync, spawn } from "node:child_process"
import path from "node:path"
import { DATABASE_URL, serverEnv, withEnv } from "./env"

/**
 * Prepares the E2E database, then starts the worker (it has no port for Playwright's webServer
 * to wait on). The api and web are started by `webServer` in playwright.config.ts.
 */
export default async function globalSetup() {
  const root = path.resolve(import.meta.dirname, "../..")
  execFileSync("bun", ["scripts/prepare-db.ts"], {
    cwd: import.meta.dirname,
    env: withEnv({ DATABASE_URL }),
    stdio: "inherit",
  })
  const worker = spawn("bun", ["src/index.ts"], {
    cwd: path.join(root, "apps/worker"),
    env: withEnv(serverEnv),
    stdio: process.env.E2E_VERBOSE ? "inherit" : "ignore",
  })
  // Stopped in the returned teardown.
  return async () => {
    worker.kill("SIGTERM")
  }
}
