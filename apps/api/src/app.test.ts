import { beforeAll, describe, expect, test } from "bun:test"

// Smoke tests that need no database/redis. Integration tests live in
// apps/api/test/ and require `bun run infra:up` (see docs/testing.md).
beforeAll(() => {
  Object.assign(process.env, {
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://sahihi:sahihi@localhost:5432/sahihi",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    WEB_URL: "http://localhost:3000",
    API_URL: "http://localhost:4000",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
    BETTER_AUTH_URL: "http://localhost:3000",
    S3_BUCKET: "test",
    S3_ACCESS_KEY_ID: "x",
    S3_SECRET_ACCESS_KEY: "x",
    EMAIL_FROM: "Test <test@example.com>",
  })
})

describe("api smoke", () => {
  test("GET /health", async () => {
    const { createApp } = await import("./app")
    const res = await createApp().request("/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test("tenant routes require a session", async () => {
    const { createApp } = await import("./app")
    const res = await createApp().request("/api/documents")
    expect(res.status).toBe(401)
  })
})
