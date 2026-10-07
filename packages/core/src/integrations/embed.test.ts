import { describe, expect, test } from "bun:test"
import { RecipientInputSchema } from "../shared/schemas"
import { EmbedSettingsSchema, normalizeEmbedOrigin } from "./embed"

describe("embed origins", () => {
  test("exact https origins; localhost over http for development", () => {
    expect(normalizeEmbedOrigin("https://app.example.co.ke")).toBe("https://app.example.co.ke")
    expect(normalizeEmbedOrigin("https://app.example.co.ke/")).toBe("https://app.example.co.ke")
    expect(normalizeEmbedOrigin("https://app.example.co.ke:8443")).toBe(
      "https://app.example.co.ke:8443",
    )
    expect(normalizeEmbedOrigin("http://localhost:5173")).toBe("http://localhost:5173")
    for (const bad of [
      "http://app.example.co.ke",
      "https://app.example.co.ke/portal",
      "https://u:p@x.co",
      "*.example.com",
      "javascript:alert(1)",
      "https://x.co?y=1",
    ])
      expect({ bad, ok: normalizeEmbedOrigin(bad) }).toEqual({ bad, ok: null })
  })

  test("settings normalise and de-duplicate, report the bad entry", () => {
    expect(
      EmbedSettingsSchema.parse({ origins: ["https://a.co/", "https://a.co", "https://b.co"] }),
    ).toEqual({
      origins: ["https://a.co", "https://b.co"],
    })
    const bad = EmbedSettingsSchema.safeParse({ origins: ["https://a.co", "https://b.co/path"] })
    expect(bad.error?.issues[0]?.path).toEqual(["origins", 1])
  })
})

describe("embedded recipients", () => {
  test("default to email delivery; embedded must use link verification", () => {
    expect(RecipientInputSchema.parse({ name: "A", email: "a@x.co" }).delivery).toBe("EMAIL")
    expect(
      RecipientInputSchema.safeParse({ name: "A", email: "a@x.co", delivery: "EMBEDDED" }).success,
    ).toBe(true)
    expect(
      RecipientInputSchema.safeParse({
        name: "A",
        email: "a@x.co",
        delivery: "EMBEDDED",
        verification: "EMAIL_OTP",
      }).success,
    ).toBe(false)
  })
})
