/**
 * Preloaded by `bun run test:integration` before any test file imports the app.
 * Points the API at an isolated test database and Redis DB, then applies migrations.
 * Needs `bun run infra:up`. See docs/testing.md → Integration tests.
 */

import path from "node:path"
import { SQL } from "bun"

const DEFAULT_TEST_DB = "postgresql://sahihi:sahihi@localhost:5432/sahihi_test"
const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DB

// Refuse to run against anything that doesn't look like a test database: resetDb() truncates it.
const dbName = new URL(databaseUrl).pathname.slice(1)
if (!dbName.endsWith("_test")) {
  throw new Error(`Integration tests need a *_test database, got "${dbName}"`)
}

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  // Separate Redis DB, so a running dev worker never picks up test jobs.
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15",
  WEB_URL: "http://localhost:3000",
  API_URL: "http://localhost:4000",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
  BETTER_AUTH_URL: "http://localhost:3000",
  S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: process.env.TEST_S3_BUCKET ?? "sahihi-documents",
  S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? "sahihi",
  S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? "sahihi-secret",
  S3_FORCE_PATH_STYLE: "true",
  EMAIL_FROM: "Sahihi Test <test@example.com>",
})

async function ensureDatabase() {
  const admin = new URL(databaseUrl)
  admin.pathname = "/postgres"
  const sql = new SQL(admin.toString())
  try {
    const rows = await sql`select 1 from pg_database where datname = ${dbName}`
    if (rows.length === 0) await sql.unsafe(`create database "${dbName}"`)
  } finally {
    await sql.close()
  }
}

function migrate() {
  const result = Bun.spawnSync(["bunx", "prisma", "migrate", "deploy"], {
    cwd: path.resolve(import.meta.dir, "../../../packages/db"),
    // Both: prisma.config.ts prefers MIGRATE_DATABASE_URL, which may point at the dev database.
    env: { ...process.env, DATABASE_URL: databaseUrl, MIGRATE_DATABASE_URL: databaseUrl },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0) {
    throw new Error(`prisma migrate deploy failed:\n${result.stderr.toString()}`)
  }
}

await ensureDatabase()
migrate()
