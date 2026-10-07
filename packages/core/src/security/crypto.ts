/**
 * Crypto helpers built on Web Crypto (works in Bun, Node ≥ 20 and the browser).
 * Raw signing tokens and OTP codes are NEVER stored — only their SHA-256 hex.
 */

const encoder = new TextEncoder()

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function sha256Hex(input: string | Uint8Array | ArrayBuffer): Promise<string> {
  // Copy into a fresh ArrayBuffer-backed view (satisfies strict BufferSource typing).
  const data = typeof input === "string" ? encoder.encode(input) : new Uint8Array(input)
  const buf = await crypto.subtle.digest("SHA-256", new Uint8Array(data))
  return toHex(buf)
}

/** 256-bit URL-safe random token for signing links. */
export function generateSigningToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export const hashSigningToken = (token: string) => sha256Hex(`signing-token:${token}`)

/** Uniform 6-digit numeric OTP (rejection sampling avoids modulo bias). */
export function generateOtp(digits = 6): string {
  const max = 10 ** digits
  const limit = Math.floor(0xffffffff / max) * max
  const buf = new Uint32Array(1)
  let n: number
  do {
    crypto.getRandomValues(buf)
    n = buf[0] as number
  } while (n >= limit)
  return String(n % max).padStart(digits, "0")
}

/** OTPs are hashed with the recipient id so equal codes don't share hashes. */
export const hashOtp = (recipientId: string, code: string) =>
  sha256Hex(`otp:${recipientId}:${code}`)

/** Human-friendly verification code for certificates, e.g. "K7QM-2XDP-9RTA". */
export function generateCertificateCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" // no 0/O/1/I
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
}

/** Constant-time string comparison for hex digests. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Minimum gap between two OTP sends for the same recipient (SMS costs money; also UX). */
export const OTP_RESEND_COOLDOWN_MS = 30_000

/** Whole seconds until another code may be sent (0 = now). */
export function otpResendWaitSec(
  lastSentAt: Date | null,
  now: Date = new Date(),
  cooldownMs = OTP_RESEND_COOLDOWN_MS,
): number {
  if (!lastSentAt) return 0
  const remaining = lastSentAt.getTime() + cooldownMs - now.getTime()
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}
