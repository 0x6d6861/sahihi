import { describe, expect, test } from "bun:test"
import { generateCertificateCode, sha256Hex } from "./crypto"
import { normalizeCertificateCode, VerifyHashSchema } from "./verify"

describe("normalizeCertificateCode", () => {
  test("accepts any spacing, dashes and case", () => {
    expect(normalizeCertificateCode("k7qm-2xdp-9rta")).toBe("K7QM-2XDP-9RTA")
    expect(normalizeCertificateCode("  K7QM 2XDP 9RTA ")).toBe("K7QM-2XDP-9RTA")
    expect(normalizeCertificateCode("K7QM2XDP9RTA")).toBe("K7QM-2XDP-9RTA")
  })
  test("rejects wrong lengths and characters outside the alphabet", () => {
    for (const bad of [
      "",
      "K7QM-2XDP",
      "K7QM-2XDP-9RTAA",
      "K7QM-2XDP-9RT0",
      "K7QM-2XDP-9RTO",
      "K7QM-2XDP-9RT1",
      "K7QM-2XDP-9RT!",
    ]) {
      expect({ bad, out: normalizeCertificateCode(bad) }).toEqual({ bad, out: null })
    }
  })
  test("every generated code round-trips", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCertificateCode()
      expect(normalizeCertificateCode(code.toLowerCase())).toBe(code)
    }
  })
})

describe("VerifyHashSchema", () => {
  test("accepts exactly what sha256Hex produces", async () => {
    expect(VerifyHashSchema.safeParse({ sha256: await sha256Hex("pdf bytes") }).success).toBe(true)
    expect(VerifyHashSchema.safeParse({ sha256: "A".repeat(64) }).success).toBe(false)
    expect(VerifyHashSchema.safeParse({ sha256: "a".repeat(63) }).success).toBe(false)
  })
})
