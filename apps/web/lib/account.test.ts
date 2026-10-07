import { describe, expect, test } from "bun:test"
import { backupCodesText, brandingLogoPath, fitWithin, totpSecretFromUri } from "./account"

describe("brandingLogoPath", () => {
  test("keeps only our branding route, as a same-origin path", () => {
    expect(brandingLogoPath("https://app.sahihi.co.ke/api/branding/org_1/logo.png?v=ab12")).toBe(
      "/api/branding/org_1/logo.png?v=ab12",
    )
    expect(brandingLogoPath("http://localhost:3000/api/branding/org_1/logo.png?v=1")).toBe(
      "/api/branding/org_1/logo.png?v=1",
    )
  })

  test("ignores anything else", () => {
    expect(brandingLogoPath(null)).toBeNull()
    expect(brandingLogoPath("https://cdn.example.com/logo.png")).toBeNull()
    expect(brandingLogoPath("https://x.test/api/branding/a/b/logo.png")).toBeNull()
    expect(brandingLogoPath("javascript:alert(1)")).toBeNull()
  })
})

describe("totpSecretFromUri", () => {
  test("groups the secret for manual entry", () => {
    expect(
      totpSecretFromUri(
        "otpauth://totp/Sahihi:amina%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Sahihi",
      ),
    ).toBe("JBSW Y3DP EHPK 3PXP")
  })

  test("null without a secret", () => {
    expect(totpSecretFromUri("otpauth://totp/Sahihi")).toBeNull()
    expect(totpSecretFromUri("not a uri")).toBeNull()
  })
})

test("backupCodesText lists every code", () => {
  const text = backupCodesText(["aaaaa-bbbbb", "ccccc-ddddd"], "amina@example.com")
  expect(text).toContain("amina@example.com")
  expect(text).toContain("aaaaa-bbbbb\nccccc-ddddd")
})

describe("fitWithin", () => {
  test("scales down to fit and never up", () => {
    expect(fitWithin(1280, 320, 640, 160)).toEqual({ width: 640, height: 160 })
    expect(fitWithin(400, 400, 640, 160)).toEqual({ width: 160, height: 160 })
    expect(fitWithin(100, 50, 640, 160)).toEqual({ width: 100, height: 50 })
  })
})
