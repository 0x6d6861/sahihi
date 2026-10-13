import { readFileSync } from "node:fs"
import path from "node:path"
import { serverEnv as e2eServerEnv } from "../env"

/**
 * The showcase stack: the E2E stack's settings with its own ports, database and Redis DB, so it
 * can't touch E2E or dev data. It runs the real drafting assistant, so it takes `AI_MODEL` and the
 * provider key from the shell, or else from the root .env (only those keys are read).
 */
export const WEB_PORT = 3200
export const API_PORT = 4200
export const WEB_URL = `http://localhost:${WEB_PORT}`
export const API_URL = `http://localhost:${API_PORT}`
export const DATABASE_URL = "postgresql://sahihi:sahihi@localhost:5432/sahihi_showcase_e2e"

const AI_KEYS = ["AI_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]

function aiEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  let file = ""
  try {
    file = readFileSync(path.resolve(import.meta.dirname, "../../../.env"), "utf8")
  } catch {}
  for (const key of AI_KEYS) {
    const fromFile = file.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim()
    const value = process.env[key] ?? fromFile
    if (value) out[key] = value.replace(/^["']|["']$/g, "")
  }
  return out
}

export const serverEnv: Record<string, string> = {
  ...e2eServerEnv,
  DATABASE_URL,
  REDIS_URL: "redis://localhost:6379/13",
  WEB_URL,
  API_URL,
  PORT: String(API_PORT),
  BETTER_AUTH_URL: WEB_URL,
  EMAIL_FROM: "Sahihi <hello@sahihi.co.ke>",
  ...aiEnv(),
}

/** Where the screenshots go: the marketing site's assets. */
export const OUT_DIR = path.resolve(import.meta.dirname, "../../website/src/assets/shots")
