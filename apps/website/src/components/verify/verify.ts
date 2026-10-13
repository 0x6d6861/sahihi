/**
 * Verify helpers. Copies of `normalizeCertificateCode` and `sha256Hex` from @sahihi/core, which
 * the website can't import (it stays self-contained). Keep them in step with
 * packages/core/src/signing/verify.ts and packages/core/src/security/crypto.ts.
 */

/** Certificate codes use this alphabet: no 0/O or 1/I, so they can be read aloud and typed back. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

/** `k7qm 2xdp 9rta` → `K7QM-2XDP-9RTA`, or null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const chars = input.toUpperCase().replace(/[\s-]/g, "")
  if (chars.length !== 12) return null
  for (const ch of chars) if (!CODE_ALPHABET.includes(ch)) return null
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
}

/** The file's SHA-256, in lowercase hex, computed on this device. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-8)}`

/** Hashing happens in memory; very large files would strain low-end phones. */
export const MAX_VERIFY_BYTES = 100 * 1024 * 1024

export type HashMatch = "signed_document" | "certificate"

const MATCH_KEY = "sahihi:verify-match"

/**
 * The checker records a hash match here (not in the URL, which anyone can forge) just before it
 * opens the certificate page, which reads it once.
 */
export function rememberMatch(code: string, match: HashMatch) {
  try {
    sessionStorage.setItem(MATCH_KEY, JSON.stringify({ code, match }))
  } catch {}
}

/** The remembered match for this certificate, cleared on read. */
export function takeMatch(code: string): HashMatch | null {
  try {
    const raw = sessionStorage.getItem(MATCH_KEY)
    sessionStorage.removeItem(MATCH_KEY)
    const saved = raw ? (JSON.parse(raw) as { code?: string; match?: string }) : null
    if (!saved || normalizeCode(saved.code ?? "") !== code) return null
    return saved.match === "signed_document" || saved.match === "certificate" ? saved.match : null
  } catch {
    return null
  }
}

/** `GET /api/verify/:code`, as the API returns it (signers' emails are masked there). */
export interface CertificateRecord {
  valid: boolean
  certificate?: { code: string; issuedAt: string; provider: string }
  envelope?: {
    title: string
    organization: string
    completedAt: string
    documents: {
      name: string
      pageCount: number | null
      originalSha256: string | null
      signedSha256: string | null
    }[]
    attachments: { name: string; sha256: string | null }[]
    signers: { name: string; email: string; signedAt: string | null }[]
  }
}

/** Dates as the app shows them, in Nairobi time. */
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  }).format(new Date(iso))
}
