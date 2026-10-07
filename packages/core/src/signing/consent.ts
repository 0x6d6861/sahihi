import { sha256Hex } from "../security/crypto"

/**
 * The electronic-signature consent the signer agrees to before submitting (docs/security.md →
 * Consent & evidence).
 *
 * Changing the wording is a legal change. NEVER edit an existing entry: add a new version, point
 * CONSENT_VERSION at it, and leave the old ones here. Envelopes signed under them must stay
 * resolvable. consent.test.ts pins each version's hash, so an in-place edit fails CI.
 */
export const CONSENT_TEXTS = {
  "2026-09-28":
    "I agree to sign this document electronically. I understand that my electronic signature is " +
    "legally binding, just like a handwritten signature, and that I can ask the sender for a paper " +
    "copy.",
} as const satisfies Record<string, string>

export type ConsentVersion = keyof typeof CONSENT_TEXTS

/** The version shown to signers now. */
export const CONSENT_VERSION: ConsentVersion = "2026-09-28"

export const CONSENT_TEXT: string = CONSENT_TEXTS[CONSENT_VERSION]

export function isConsentVersion(v: string): v is ConsentVersion {
  return Object.hasOwn(CONSENT_TEXTS, v)
}

/** SHA-256 of a version's exact wording, recorded with the consent as evidence. */
export function consentTextSha256(version: ConsentVersion): Promise<string> {
  return sha256Hex(CONSENT_TEXTS[version])
}

/** What the `recipient.consented` audit event records in its `data`. */
export interface ConsentEvidence {
  consentVersion: string
  consentTextSha256: string
}

/**
 * Reads consent evidence from a `recipient.consented` event's data. Returns null for events
 * written before versions were recorded, or for malformed data.
 */
export function readConsentEvidence(data: unknown): ConsentEvidence | null {
  if (!data || typeof data !== "object") return null
  const { consentVersion, consentTextSha256: hash } = data as Record<string, unknown>
  if (typeof consentVersion !== "string" || typeof hash !== "string") return null
  if (!/^[0-9a-f]{64}$/.test(hash)) return null
  return { consentVersion, consentTextSha256: hash }
}
