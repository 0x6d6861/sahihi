import { describe, expect, test } from "bun:test"
import { type ChainedAuditEvent, canonicalJson, chainAuditEvent, verifyAuditChain } from "./audit"
import {
  generateCertificateCode,
  generateOtp,
  generateSigningToken,
  hashSigningToken,
  OTP_RESEND_COOLDOWN_MS,
  otpResendWaitSec,
  sha256Hex,
  timingSafeEqual,
} from "./crypto"

describe("crypto", () => {
  test("sha256Hex known vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })
  test("signing tokens are 43-char base64url and unique", () => {
    const a = generateSigningToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(generateSigningToken())
  })
  test("token hashes are deterministic", async () => {
    const t = generateSigningToken()
    expect(await hashSigningToken(t)).toBe(await hashSigningToken(t))
  })
  test("otp is 6 digits", () => {
    for (let i = 0; i < 50; i++) expect(generateOtp()).toMatch(/^\d{6}$/)
  })
  test("certificate code format", () => {
    expect(generateCertificateCode()).toMatch(
      /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/,
    )
  })
  test("timingSafeEqual", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true)
    expect(timingSafeEqual("abc", "abd")).toBe(false)
    expect(timingSafeEqual("abc", "ab")).toBe(false)
  })
})

describe("audit chain", () => {
  test("canonicalJson sorts keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    )
  })

  const base = {
    envelopeId: "env_1",
    recipientId: null,
    actorUserId: "user_1",
    data: null,
    ipAddress: "127.0.0.1",
    userAgent: "test",
  }

  async function buildChain(): Promise<ChainedAuditEvent[]> {
    const e1 = await chainAuditEvent(null, {
      ...base,
      type: "envelope.created",
      occurredAt: "2026-01-01T00:00:00.000Z",
    })
    const e2 = await chainAuditEvent(e1, {
      ...base,
      type: "envelope.sent",
      occurredAt: "2026-01-01T00:01:00.000Z",
    })
    const e3 = await chainAuditEvent(e2, {
      ...base,
      type: "recipient.signed",
      recipientId: "r1",
      data: { fields: 3 },
      occurredAt: "2026-01-01T00:02:00.000Z",
    })
    return [e1, e2, e3]
  }

  test("valid chain verifies", async () => {
    const chain = await buildChain()
    expect(chain.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(await verifyAuditChain(chain)).toEqual({ valid: true })
  })

  test("tampering with data is detected", async () => {
    const chain = await buildChain()
    ;(chain[2] as ChainedAuditEvent).data = { fields: 4 }
    expect(await verifyAuditChain(chain)).toMatchObject({ valid: false, brokenAtSeq: 3 })
  })

  test("deleting an event is detected", async () => {
    const chain = await buildChain()
    expect(await verifyAuditChain([chain[0], chain[2]] as ChainedAuditEvent[])).toMatchObject({
      valid: false,
    })
  })
})

describe("otpResendWaitSec", () => {
  const t0 = new Date("2026-09-26T12:00:00Z")
  const at = (ms: number) => new Date(t0.getTime() + ms)
  test("no previous code → send now", () => {
    expect(otpResendWaitSec(null, t0)).toBe(0)
  })
  test("counts down in whole seconds, rounding up", () => {
    expect(OTP_RESEND_COOLDOWN_MS).toBe(30_000)
    expect(otpResendWaitSec(t0, at(0))).toBe(30)
    expect(otpResendWaitSec(t0, at(29_001))).toBe(1)
    expect(otpResendWaitSec(t0, at(30_000))).toBe(0)
    expect(otpResendWaitSec(t0, at(90_000))).toBe(0)
  })
})
