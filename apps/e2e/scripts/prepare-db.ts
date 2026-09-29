/**
 * Creates the E2E database if needed and applies migrations (run by global-setup with Bun).
 * Refuses anything that isn't a *_e2e database.
 */
import path from "node:path"
import { SQL } from "bun"

const url = process.env.DATABASE_URL ?? ""
const name = new URL(url).pathname.slice(1)
if (!name.endsWith("_e2e")) throw new Error(`E2E needs a *_e2e database, got "${name}"`)

const admin = new URL(url)
admin.pathname = "/postgres"
const sql = new SQL(admin.toString())
try {
  const rows = await sql`select 1 from pg_database where datname = ${name}`
  if (rows.length === 0) await sql.unsafe(`create database "${name}"`)
} finally {
  await sql.close()
}

const migrate = Bun.spawnSync(["bunx", "prisma", "migrate", "deploy"], {
  cwd: path.resolve(import.meta.dir, "../../../packages/db"),
  env: { ...process.env, DATABASE_URL: url, MIGRATE_DATABASE_URL: url },
  stdout: "pipe",
  stderr: "pipe",
})
if (migrate.exitCode !== 0) throw new Error(`migrate deploy failed:\n${migrate.stderr.toString()}`)
console.log(`e2e database ${name} ready`)
