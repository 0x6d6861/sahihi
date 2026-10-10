import { describe, expect, test } from "bun:test"
import {
  assistantQuotaExceededMessage,
  billingPeriod,
  canAddSeat,
  checkAssistantQuota,
  checkEnvelopeQuota,
  PLANS,
  planFor,
  quotaExceededMessage,
  usageLevel,
} from "./billing"

describe("plans", () => {
  test("unknown or missing plans fall back to Free, never unlimited", () => {
    expect(planFor("business").id).toBe("business")
    expect(planFor(null).id).toBe("free")
    expect(planFor("platinum").id).toBe("free")
  })
})

describe("billingPeriod (calendar month, Africa/Nairobi)", () => {
  test("mid-month", () => {
    expect(billingPeriod(new Date("2026-09-29T08:00:00Z"))).toEqual({
      start: new Date("2026-08-31T21:00:00Z"), // 1 Sep 00:00 EAT
      end: new Date("2026-09-30T21:00:00Z"), // 1 Oct 00:00 EAT
    })
  })

  test("the month boundary follows Nairobi time, not UTC", () => {
    // 30 Sep 22:30 UTC is already 1 Oct 01:30 in Nairobi.
    expect(billingPeriod(new Date("2026-09-30T22:30:00Z")).start).toEqual(
      new Date("2026-09-30T21:00:00Z"),
    )
    // 30 Sep 20:59 UTC is still September there.
    expect(billingPeriod(new Date("2026-09-30T20:59:00Z")).start).toEqual(
      new Date("2026-08-31T21:00:00Z"),
    )
  })

  test("December rolls into January", () => {
    expect(billingPeriod(new Date("2026-12-15T00:00:00Z")).end).toEqual(
      new Date("2026-12-31T21:00:00Z"),
    )
  })
})

describe("quotas", () => {
  test("envelope quota: remaining after this send, refused at the limit, unlimited plans", () => {
    expect(checkEnvelopeQuota(PLANS.free, 0)).toEqual({ ok: true, remaining: 4 })
    expect(checkEnvelopeQuota(PLANS.free, 4)).toEqual({ ok: true, remaining: 0 })
    expect(checkEnvelopeQuota(PLANS.free, 5)).toEqual({ ok: false, limit: 5, used: 5 })
    expect(checkEnvelopeQuota(PLANS.enterprise, 10_000)).toEqual({ ok: true, remaining: null })
  })

  test("assistant quota: refused at the plan's replies, unlimited on Enterprise", () => {
    expect(checkAssistantQuota(PLANS.free, 29)).toEqual({ ok: true, remaining: 0 })
    expect(checkAssistantQuota(PLANS.free, 30)).toEqual({ ok: false, limit: 30, used: 30 })
    expect(checkAssistantQuota(PLANS.enterprise, 1e6)).toEqual({ ok: true, remaining: null })
    const message = assistantQuotaExceededMessage(PLANS.free, new Date("2026-10-31T21:00:00Z"))
    expect(message).toContain("30 AI assistant replies")
    expect(message).toContain("1 November")
  })

  test("usage level: warning from 80 %, exceeded at the limit", () => {
    expect(usageLevel(3, 5)).toBe("ok")
    expect(usageLevel(4, 5)).toBe("warning")
    expect(usageLevel(5, 5)).toBe("exceeded")
    expect(usageLevel(39, 50)).toBe("ok")
    expect(usageLevel(40, 50)).toBe("warning")
    expect(usageLevel(1_000_000, null)).toBe("ok")
  })

  test("seats count pending invitations", () => {
    expect(canAddSeat(PLANS.free, 1, 0)).toBe(true)
    expect(canAddSeat(PLANS.free, 1, 1)).toBe(false)
    expect(canAddSeat(PLANS.free, 2, 0)).toBe(false)
    expect(canAddSeat(PLANS.enterprise, 500, 500)).toBe(true)
  })

  test("the over-quota message says when sending resumes (Nairobi date)", () => {
    expect(quotaExceededMessage(PLANS.free, new Date("2026-09-30T21:00:00Z"))).toContain(
      "1 October",
    )
  })
})
