/**
 * The E2E stack's environment (docs/testing.md → E2E). Everything is explicit, so the run never
 * reads the developer's .env or touches the dev database: own database, own Redis DB, own ports.
 * Postgres, Redis, MinIO and Mailpit come from `bun run infra:up`.
 */
export const WEB_PORT = 3100
export const API_PORT = 4100
export const WEB_URL = `http://localhost:${WEB_PORT}`
export const API_URL = `http://localhost:${API_PORT}`
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025"

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://sahihi:sahihi@localhost:5432/sahihi_e2e"

/** Env for the api and worker processes. */
export const serverEnv: Record<string, string> = {
  NODE_ENV: "development",
  DATABASE_URL,
  REDIS_URL: process.env.E2E_REDIS_URL ?? "redis://localhost:6379/14",
  WEB_URL,
  API_URL,
  PORT: String(API_PORT),
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-1234",
  BETTER_AUTH_URL: WEB_URL,
  S3_ENDPOINT: process.env.E2E_S3_ENDPOINT ?? "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: process.env.E2E_S3_BUCKET ?? "sahihi-documents",
  S3_ACCESS_KEY_ID: process.env.E2E_S3_ACCESS_KEY_ID ?? "sahihi",
  S3_SECRET_ACCESS_KEY: process.env.E2E_S3_SECRET_ACCESS_KEY ?? "sahihi-secret",
  S3_FORCE_PATH_STYLE: "true",
  EMAIL_TRANSPORT: "smtp",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  EMAIL_FROM: "Sahihi E2E <e2e@example.test>",
}

/** PATH etc. from the parent, then the stack's own values (never the developer's .env). */
export const withEnv = (extra: Record<string, string>) => ({
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  ...extra,
})
