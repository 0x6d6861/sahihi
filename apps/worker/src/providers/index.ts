import { getEnv } from "@sahihi/config"
import type { EnvelopeEvidence, SealResult, SigningProvider } from "@sahihi/core"

/**
 * INTERNAL: no cryptographic seal — evidence lives in the audit trail and the
 * Certificate of Completion. The stamped PDF is returned unchanged.
 */
export class InternalSigningProvider implements SigningProvider {
  readonly kind = "INTERNAL" as const
  async seal(stampedPdf: Uint8Array, _evidence: EnvelopeEvidence): Promise<SealResult> {
    return { pdf: stampedPdf, provider: "INTERNAL", providerRef: null }
  }
}

/**
 * CA: placeholder for a licensed Certification Service Provider integration
 * (PAdES-B-LT signature over the final PDF). See docs/certificates.md → "CA integration".
 */
export class CaSigningProvider implements SigningProvider {
  readonly kind = "CA" as const
  async seal(_stampedPdf: Uint8Array, _evidence: EnvelopeEvidence): Promise<SealResult> {
    throw new Error("CA signing provider is not implemented yet")
  }
}

export function getSigningProvider(): SigningProvider {
  return getEnv().SIGNING_PROVIDER === "ca"
    ? new CaSigningProvider()
    : new InternalSigningProvider()
}
