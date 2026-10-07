/**
 * Pluggable signing backend. Today: INTERNAL (visual stamp + audit trail +
 * Certificate of Completion). Later: CA — a licensed Certification Service
 * Provider applies a PAdES digital signature to the final PDF.
 *
 * The finalize job only talks to this interface. See docs/certificates.md.
 */

export interface SignerEvidence {
  name: string
  email: string
  phone: string | null
  role: string
  verification: string
  ipAddress: string | null
  userAgent: string | null
  viewedAt: string | null
  signedAt: string | null
}

export interface EnvelopeEvidence {
  envelopeId: string
  title: string
  organizationName: string
  documentName: string
  originalSha256: string
  signers: SignerEvidence[]
  completedAt: string
}

export interface SealResult {
  /** Possibly re-signed PDF bytes (CA providers embed a PAdES signature). */
  pdf: Uint8Array
  provider: "INTERNAL" | "CA"
  /** Provider transaction / certificate serial, if any. */
  providerRef: string | null
}

export interface SigningProvider {
  readonly kind: "INTERNAL" | "CA"
  /** Apply the provider's seal to the already-stamped PDF. */
  seal(stampedPdf: Uint8Array, evidence: EnvelopeEvidence): Promise<SealResult>
}
