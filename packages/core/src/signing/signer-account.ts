import type { EnvelopeStatus, RecipientStatus } from "../shared/enums"

/**
 * Optional signer accounts (ADR 0062): someone with a Sahihi account and a **verified** email sees
 * the envelopes sent to that address, in every workspace, on their Signed documents page. A signing
 * token never logs anyone in and never links an account; only the verified email does.
 */

/** Emails match without regard to case or surrounding space. */
export function normalizeSignerEmail(email: string): string {
  return email.trim().toLowerCase()
}

export type SignerListGroup = "waiting" | "signed" | "closed"

/**
 * Where an envelope stands for this signer: still theirs to sign, signed (or completed for a
 * viewer), or closed before they signed (declined, voided, expired).
 */
export function signerListGroup(
  recipient: RecipientStatus,
  envelope: EnvelopeStatus,
): SignerListGroup {
  if (recipient === "SIGNED" || envelope === "COMPLETED") return "signed"
  if (envelope === "SENT" || envelope === "IN_PROGRESS") {
    return recipient === "DECLINED" ? "closed" : "waiting"
  }
  return "closed"
}

/** A completed envelope's files may be downloaded until they're purged under retention. */
export function signerCanDownload(envelope: {
  status: EnvelopeStatus
  purgedAt: Date | string | null
  hasCertificate: boolean
}): boolean {
  return envelope.status === "COMPLETED" && !envelope.purgedAt && envelope.hasCertificate
}
