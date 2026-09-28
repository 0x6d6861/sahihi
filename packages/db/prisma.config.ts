import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "prisma/config"

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
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
      for (const line of content.split("\n")) {
        const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)$/)
        if (match) {
          const val = match[1]?.trim() ?? ""
          return val.replace(/^["']|["']$/g, "")
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
