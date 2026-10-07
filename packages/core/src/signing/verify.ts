import { z } from "zod"

/**
 * Public verification (docs/certificates.md). Anyone can check a certificate code, or a PDF by
 * hashing it locally and sending only the SHA-256.
 */

/** `POST /api/verify/hash`: the SHA-256 (lowercase hex) of a file hashed in the browser. */
export const VerifyHashSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })
export type VerifyHashInput = z.infer<typeof VerifyHashSchema>

/** What a hash matched: the signed PDF, the certificate PDF, or nothing Sahihi issued. */
export type VerifyHashMatch = "signed_document" | "certificate" | null

/** Alphabet used by generateCertificateCode (no 0/O/1/I, so codes survive being read aloud). */
export const CERTIFICATE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

/**
 * Normalizes a typed or scanned certificate code to `XXXX-XXXX-XXXX`, or returns null if it can't
 * be one: wrong length, or characters outside the alphabet. Case, spaces and dashes are ignored.
 */
export function normalizeCertificateCode(input: string): string | null {
  const chars = input.toUpperCase().replace(/[\s-]/g, "")
  if (chars.length !== 12) return null
  for (const ch of chars) if (!CERTIFICATE_CODE_ALPHABET.includes(ch)) return null
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
}
