import { execFileSync, spawn } from "node:child_process"
import path from "node:path"
import { withEnv } from "../env"
import { DATABASE_URL, serverEnv } from "./env"

/**
 * A fresh showcase database on every run (dropped and recreated, so the data is always the same
 * story), then the worker. The api and web are started by `webServer`.
 */
export default async function globalSetup() {
  const root = path.resolve(import.meta.dirname, "../../..")
  execFileSync("bun", ["scripts/prepare-db.ts", "--fresh"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: withEnv({ DATABASE_URL }),
    stdio: "inherit",
  })
  // SHOWCASE_REUSE: the api, web and worker are already running (iterating on the capture).
  if (process.env.SHOWCASE_REUSE) return async () => {}
  const worker = spawn("bun", ["src/index.ts"], {
    cwd: path.join(root, "apps/worker"),
    env: withEnv(serverEnv),
    stdio: process.env.SHOWCASE_VERBOSE ? "inherit" : "ignore",
  })
  return async () => {
    worker.kill("SIGTERM")
  }
}
