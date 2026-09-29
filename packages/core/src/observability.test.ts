import { describe, expect, test } from "bun:test"
import { formatLogLine, maskTokens, redact, scrubErrorEvent, shouldLog } from "./observability"

const TOKEN = "Iw5EsHZ9-zU3txYXca_4_Le8A8gQqrB-ZskLjCxij_A"

describe("maskTokens", () => {
  test("signing tokens in paths and secret query params", () => {
    expect(maskTokens(`GET /api/sign/${TOKEN}/file 200`)).toBe("GET /api/sign/[token]/file 200")
    expect(maskTokens(`http://x/sign/${TOKEN}`)).toBe("http://x/sign/[token]")
    expect(maskTokens("/api/auth/verify-email?token=abc.def&callbackURL=/x")).toBe(
      "/api/auth/verify-email?token=[redacted]&callbackURL=/x",
    )
    expect(maskTokens("/api/envelopes/cm123/send")).toBe("/api/envelopes/cm123/send")
  })
})

describe("redact", () => {
  test("secret and personal keys at any depth, any case; tokens inside strings", () => {
    const out = redact({
      recipientId: "r1",
      token: TOKEN,
      nested: { Email: "a@b.co", Authorization: "Bearer x", list: [{ code: "123456" }] },
      url: `/sign/${TOKEN}`,
      err: new Error(`bad /sign/${TOKEN}`),
    })
    expect(out).toEqual({
      recipientId: "r1",
      token: "[redacted]",
      nested: { Email: "[redacted]", Authorization: "[redacted]", list: [{ code: "[redacted]" }] },
      url: "/sign/[token]",
      err: { name: "Error", message: "bad /sign/[token]" },
    })
  })

  test("cycles and depth don't blow up", () => {
    const a: Record<string, unknown> = { id: 1 }
    a.self = a
    expect(redact(a)).toEqual({ id: 1, self: "[circular]" })
  })
})

describe("log lines", () => {
  test("JSON with level, service, redacted fields", () => {
    const line = JSON.parse(
      formatLogLine(
        "info",
        "api",
        `GET /api/sign/${TOKEN}`,
        { status: 200, token: "x" },
        new Date("2026-09-29T00:00:00Z"),
      ),
    )
    expect(line).toEqual({
      time: "2026-09-29T00:00:00.000Z",
      level: "info",
      service: "api",
      msg: "GET /api/sign/[token]",
      status: 200,
      token: "[redacted]",
    })
    expect(shouldLog("debug", "info")).toBe(false)
    expect(shouldLog("error", "info")).toBe(true)
  })
})

describe("scrubErrorEvent", () => {
  test("drops cookies, auth headers, bodies and user PII; masks tokens", () => {
    const event = scrubErrorEvent({
      request: {
        url: `https://app.sahihi.co.ke/sign/${TOKEN}`,
        headers: {
          Cookie: "sahihi.session_token=abc",
          "user-agent": "UA",
          authorization: "Bearer y",
        },
        cookies: { a: 1 },
        data: '{"values":[]}',
      },
      user: { id: "u1", email: "a@b.co", ip_address: "1.2.3.4" },
      message: `failed for /sign/${TOKEN}`,
      breadcrumbs: [
        { message: `fetch /api/sign/${TOKEN}`, data: { url: `/sign/${TOKEN}`, email: "x@y.z" } },
      ],
    })
    expect(event as unknown).toEqual({
      request: { url: "https://app.sahihi.co.ke/sign/[token]", headers: { "user-agent": "UA" } },
      user: { id: "u1" },
      message: "failed for /sign/[token]",
      breadcrumbs: [
        { message: "fetch /api/sign/[token]", data: { url: "/sign/[token]", email: "[redacted]" } },
      ],
    })
  })
})
