import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "prisma/config"

/**
 * The Prisma CLI (migrations) connects as the schema OWNER: `MIGRATE_DATABASE_URL` when set, else
 * `DATABASE_URL`. In production the api and worker use `DATABASE_URL` as a login role in
 * `sahihi_app`, which can't run DDL or touch AuditEvent (docs/security.md).
 */
const KEYS = ["MIGRATE_DATABASE_URL", "DATABASE_URL"] as const

function getDatabaseUrl(): string {
  for (const key of KEYS) {
    const value = process.env[key]
    if (value) return value
  }

  // When running commands from packages/db, search for root .env
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    typeof import.meta.dirname === "string" ? path.resolve(import.meta.dirname, "../../.env") : "",
  ].filter(Boolean)

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8")
      for (const key of KEYS) {
        for (const line of content.split("\n")) {
          const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`))
          const val = match?.[1]?.trim().replace(/^["']|["']$/g, "")
          if (val) return val
        }
      }
    }
  }

  return "postgresql://placeholder@localhost:5432/placeholder"
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations") },
  datasource: {
    url: getDatabaseUrl(),
  },
})
