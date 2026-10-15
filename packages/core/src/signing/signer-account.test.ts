import { describe, expect, test } from "bun:test"
import { normalizeSignerEmail, signerCanDownload, signerListGroup } from "./signer-account"

describe("normalizeSignerEmail", () => {
  test("ignores case and surrounding space", () => {
    expect(normalizeSignerEmail("  Juma.Ochieng@Gmail.com ")).toBe("juma.ochieng@gmail.com")
  })
})

describe("signerListGroup", () => {
  test("out for signature and not signed yet: waiting", () => {
    expect(signerListGroup("SENT", "IN_PROGRESS")).toBe("waiting")
    expect(signerListGroup("PENDING", "SENT")).toBe("waiting")
  })
  test("signed, or completed for anyone on it: signed", () => {
    expect(signerListGroup("SIGNED", "IN_PROGRESS")).toBe("signed")
    expect(signerListGroup("SENT", "COMPLETED")).toBe("signed")
  })
  test("declined, voided or expired before signing: closed", () => {
    expect(signerListGroup("DECLINED", "DECLINED")).toBe("closed")
    expect(signerListGroup("SENT", "VOIDED")).toBe("closed")
    expect(signerListGroup("VIEWED", "EXPIRED")).toBe("closed")
  })
})

describe("signerCanDownload", () => {
  test("only completed, certified and not purged", () => {
    const done = { status: "COMPLETED" as const, purgedAt: null, hasCertificate: true }
    expect(signerCanDownload(done)).toBe(true)
    expect(signerCanDownload({ ...done, purgedAt: new Date() })).toBe(false)
    expect(signerCanDownload({ ...done, hasCertificate: false })).toBe(false)
    expect(signerCanDownload({ ...done, status: "IN_PROGRESS" })).toBe(false)
  })
})
