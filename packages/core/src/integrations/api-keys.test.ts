import { describe, expect, test } from "bun:test"
import { hashSigningToken } from "../security/crypto"
import { hasPermission } from "../workspace/permissions"
import {
  API_KEY_RE,
  apiKeyHint,
  CreateApiKeySchema,
  generateApiKey,
  hashApiKey,
  hasScope,
} from "./api-keys"

describe("API keys", () => {
  test("format, uniqueness, hint", () => {
    const a = generateApiKey()
    expect(a).toMatch(API_KEY_RE)
    expect(generateApiKey()).not.toBe(a)
    expect(apiKeyHint(a)).toBe(`${a.slice(0, 14)}…${a.slice(-4)}`)
    expect(apiKeyHint(a)).not.toContain(a.slice(14, -4))
  })

  test("hash is stable and domain-separated from signing tokens", async () => {
    const key = generateApiKey()
    expect(await hashApiKey(key)).toBe(await hashApiKey(key))
    expect(await hashApiKey(key)).not.toBe(await hashSigningToken(key))
  })

  test("create schema: scopes required and de-duplicated; offered expiries only", () => {
    expect(CreateApiKeySchema.safeParse({ name: "ERP", scopes: [] }).success).toBe(false)
    expect(CreateApiKeySchema.safeParse({ name: "ERP", scopes: ["admin:*"] }).success).toBe(false)
    expect(
      CreateApiKeySchema.parse({ name: "ERP", scopes: ["envelopes:read", "envelopes:read"] }),
    ).toEqual({
      name: "ERP",
      scopes: ["envelopes:read"],
      expiresInDays: null,
    })
    expect(
      CreateApiKeySchema.safeParse({ name: "ERP", scopes: ["envelopes:read"], expiresInDays: 7 })
        .success,
    ).toBe(false)
  })

  test("scopes and who may manage keys", () => {
    expect(hasScope(["envelopes:read"], "envelopes:read")).toBe(true)
    expect(hasScope(["envelopes:read"], "envelopes:write")).toBe(false)
    expect(hasPermission("owner", { api: ["manage"] })).toBe(true)
    expect(hasPermission("admin", { api: ["manage"] })).toBe(true)
    expect(hasPermission("member", { api: ["manage"] })).toBe(false)
  })
})
