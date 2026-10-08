import type {
  EnvelopeStatus,
  FieldType,
  NormalizedRect,
  RecipientStatus,
  SigningOrder,
} from "@sahihi/core"
import type { AttachmentView, EnvelopeDocumentView } from "./envelope-documents"
import type { SavedRecipient } from "./recipients"

/** `GET /envelopes/:id` → `envelope`, read by the envelope page and the draft editor. */
export interface EnvelopeDetail {
  id: string
  title: string
  message: string | null
  status: EnvelopeStatus
  signingOrder: SigningOrder
  expiresAt: string | null
  /** The documents to sign, in signing order (ADR 0037). */
  documents: EnvelopeDocumentView[]
  /** Supporting files: shared with recipients, never signed. */
  attachments: AttachmentView[]
  recipients: (SavedRecipient & {
    status: RecipientStatus
    colorIndex: number
    notifiedAt: string | null
    lastRemindedAt: string | null
    signedAt: string | null
  })[]
  fields: (NormalizedRect & {
    id: string
    recipientId: string
    envelopeDocumentId: string
    type: FieldType
    page: number
    required: boolean
    label: string | null
  })[]
  completedAt: string | null
  /** Files and personal data deleted (docs/data-retention.md) */
  purgedAt: string | null
  /** Set by the finalize job, shortly after COMPLETED. */
  certificate: { code: string; issuedAt: string; provider: "INTERNAL" | "CA" } | null
}

export interface EnvelopeResponse {
  envelope: EnvelopeDetail
  permissions: { manage: boolean; purge: boolean }
}

/** Only an editable draft opens in the draft editor; everyone else gets the read-only page. */
export function isEditableDraft(r: EnvelopeResponse): boolean {
  return r.envelope.status === "DRAFT" && r.permissions.manage
}
