import { describe, expect, test } from "bun:test"
import {
  CONSENT_TEXT,
  CONSENT_TEXTS,
  CONSENT_VERSION,
  consentTextSha256,
  isConsentVersion,
  readConsentEvidence,
} from "./consent"

/**
 * Every published wording, pinned. If this fails you edited consent text in place: restore it and
 * add a NEW version instead (legal evidence for already-signed envelopes depends on the old text).
 */
const PINNED: Record<string, string> = {
  "2026-09-28": "eaecde1e34c999a4839bc6fea088fd834e60bf3321b17cc80b54e0ddd23ed599",
}

describe("consent versions", () => {
  test("published wordings are never edited in place", async () => {
    for (const [version, hash] of Object.entries(PINNED)) {
      expect(isConsentVersion(version)).toBe(true)
      if (!isConsentVersion(version)) continue
      expect({ version, hash: await consentTextSha256(version) }).toEqual({ version, hash })
    }
  })

  test("every version in the registry is pinned (add new ones to PINNED)", () => {
    expect(Object.keys(CONSENT_TEXTS).sort()).toEqual(Object.keys(PINNED).sort())
  })

  test("the current version resolves to the text signers see", () => {
    expect(CONSENT_TEXT).toBe(CONSENT_TEXTS[CONSENT_VERSION])
    expect(isConsentVersion("1999-01-01")).toBe(false)
    expect(isConsentVersion("toString")).toBe(false)
  })
})

describe("readConsentEvidence", () => {
  const hash = "a".repeat(64)
  test("reads recorded evidence", () => {
    expect(readConsentEvidence({ consentVersion: "2026-09-28", consentTextSha256: hash })).toEqual({
      consentVersion: "2026-09-28",
      consentTextSha256: hash,
    })
  })
  test("older events without evidence, or malformed data, read as null", () => {
    expect(readConsentEvidence(null)).toBeNull()
    expect(readConsentEvidence({})).toBeNull()
    expect(readConsentEvidence({ consentVersion: "x", consentTextSha256: "nothex" })).toBeNull()
    expect(readConsentEvidence("string")).toBeNull()
  })
})
