import { z } from "zod"

/**
 * Settings → Security (docs/auth.md → Account settings): password, two-factor authentication and
 * active sessions. better-auth enforces all of it; these schemas and helpers shape the forms.
 */

/** Same minimum as `emailAndPassword.minPasswordLength` in apps/api/src/auth.ts. */
export const MIN_PASSWORD_LENGTH = 10

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(128),
    confirmPassword: z.string(),
    revokeOtherSessions: z.boolean(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password you haven't used here",
  })
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>

/** A 6-digit code from an authenticator app. */
export const TotpCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code")

/** better-auth backup codes are 10 characters, shown as `xxxxx-xxxxx`. */
export const BackupCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/, "Enter one of your backup codes")

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
]

/** "Chrome on macOS" for the sessions list. Unknown agents read "Unknown device". */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device"
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1]
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1]
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? "Unknown device"
}
