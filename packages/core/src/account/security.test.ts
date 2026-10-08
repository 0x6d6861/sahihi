import { describe, expect, test } from "bun:test"
import {
  BackupCodeSchema,
  ChangePasswordSchema,
  describeUserAgent,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  TotpCodeSchema,
} from "./security"

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"

describe("describeUserAgent", () => {
  test("names the browser and the system", () => {
    expect(describeUserAgent(CHROME_MAC)).toBe("Chrome on macOS")
    expect(describeUserAgent(SAFARI_IPHONE)).toBe("Safari on iOS")
    expect(describeUserAgent(EDGE_WINDOWS)).toBe("Edge on Windows")
    expect(describeUserAgent(FIREFOX_LINUX)).toBe("Firefox on Linux")
  })

  test("falls back for unknown or missing agents", () => {
    expect(describeUserAgent(null)).toBe("Unknown device")
    expect(describeUserAgent("curl/8.7.1")).toBe("Unknown device")
  })
})

describe("ChangePasswordSchema", () => {
  const base = {
    currentPassword: "old-password-1",
    newPassword: "new-password-1",
    confirmPassword: "new-password-1",
    revokeOtherSessions: true,
  }

  test("accepts a matching new password", () => {
    expect(ChangePasswordSchema.safeParse(base).success).toBe(true)
  })

  test("rejects a short, mismatched or unchanged password", () => {
    expect(
      ChangePasswordSchema.safeParse({ ...base, newPassword: "short", confirmPassword: "short" })
        .success,
    ).toBe(false)
    expect(
      ChangePasswordSchema.safeParse({ ...base, confirmPassword: "different-1" }).success,
    ).toBe(false)
    expect(
      ChangePasswordSchema.safeParse({
        ...base,
        newPassword: base.currentPassword,
        confirmPassword: base.currentPassword,
      }).success,
    ).toBe(false)
  })
})

describe("two-factor codes", () => {
  test("TOTP codes are six digits", () => {
    expect(TotpCodeSchema.safeParse("123456").success).toBe(true)
    expect(TotpCodeSchema.safeParse("12345").success).toBe(false)
    expect(TotpCodeSchema.safeParse("12345a").success).toBe(false)
  })

  test("backup codes accept better-auth's xxxxx-xxxxx with or without the dash", () => {
    expect(BackupCodeSchema.safeParse("aB3dE-fG7hJ").success).toBe(true)
    expect(BackupCodeSchema.safeParse("aB3dEfG7hJ").success).toBe(true)
    expect(BackupCodeSchema.safeParse("abc").success).toBe(false)
  })
})

describe("forgot and reset password", () => {
  test("ForgotPasswordSchema wants an email address", () => {
    expect(ForgotPasswordSchema.safeParse({ email: " ada@example.com " }).data).toEqual({
      email: "ada@example.com",
    })
    expect(ForgotPasswordSchema.safeParse({ email: "ada" }).success).toBe(false)
  })

  test("ResetPasswordSchema checks length and the repeat", () => {
    const ok = { newPassword: "correct horse", confirmPassword: "correct horse" }
    expect(ResetPasswordSchema.safeParse(ok).success).toBe(true)
    expect(ResetPasswordSchema.safeParse({ ...ok, confirmPassword: "other" }).success).toBe(false)
    expect(
      ResetPasswordSchema.safeParse({ newPassword: "short", confirmPassword: "short" }).success,
    ).toBe(false)
  })
})
