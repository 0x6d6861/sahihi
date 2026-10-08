import type { AuditEventType } from "@sahihi/core"

/** Human-readable text for the Activity tab. `who` is the recipient's name when there is one. */
const LABELS: Record<AuditEventType, (who: string) => string> = {
  "envelope.created": () => "Envelope created",
  "envelope.document_replaced": () => "Document replaced with a prepared version",
  "envelope.document_added": () => "Document added",
  "envelope.document_removed": () => "Document removed",
  "envelope.documents_reordered": () => "Documents reordered",
  "envelope.attachment_added": () => "Supporting file added",
  "envelope.attachment_removed": () => "Supporting file removed",
  "envelope.sent": () => "Envelope sent",
  "envelope.voided": () => "Envelope voided",
  "envelope.expired": () => "Envelope expired",
  "envelope.completed": () => "Everyone has signed",
  "envelope.declined": () => "Envelope declined",
  "recipient.notified": (who) => `Invitation emailed to ${who}`,
  "recipient.reminded": (who) => `Reminder sent to ${who}`,
  "recipient.link_opened": (who) => `${who} opened the signing link`,
  "recipient.otp_sent": (who) => `Verification code sent to ${who}`,
  "recipient.otp_verified": (who) => `${who} verified their identity`,
  "recipient.otp_failed": (who) => `${who} entered a wrong verification code`,
  "recipient.consented": (who) => `${who} agreed to sign electronically`,
  "recipient.viewed": (who) => `${who} viewed the documents`,
  "recipient.attachment_viewed": (who) => `${who} downloaded a supporting file`,
  "recipient.field_filled": (who) => `${who} filled a field`,
  "recipient.signed": (who) => `${who} signed`,
  "recipient.declined": (who) => `${who} declined to sign`,
  "document.finalized": () => "Signed PDF produced",
  "certificate.issued": () => "Certificate of completion issued",
  "envelope.purged": () => "Files and personal data deleted",
  "recipient.link_issued": (who: string) => `Embedded signing link issued for ${who}`,
}

export function auditEventLabel(
  type: string,
  recipientName: string | null | undefined,
  data?: Record<string, unknown> | null,
): string {
  const label = LABELS[type as AuditEventType]
  if (!label) return type
  const text = label(recipientName || "A recipient")
  // A few events carry a sender-supplied reason worth showing.
  const reason = typeof data?.reason === "string" ? data.reason.trim() : ""
  if (reason && (type === "envelope.voided" || type === "recipient.declined")) {
    return `${text}: “${reason}”`
  }
  // File events name the file (ADR 0037).
  const name =
    typeof data?.name === "string"
      ? data.name
      : typeof data?.documentName === "string"
        ? data.documentName
        : ""
  const named =
    type === "envelope.document_removed" ||
    type === "envelope.attachment_added" ||
    type === "envelope.attachment_removed" ||
    type === "recipient.attachment_viewed" ||
    type === "document.finalized"
  if (name && named) return `${text}: ${name}`
  if (type === "envelope.document_added" && Array.isArray(data?.documents)) {
    const names = (data.documents as { name?: unknown }[])
      .map((d) => (typeof d.name === "string" ? d.name : null))
      .filter(Boolean)
    if (names.length > 0)
      return `${names.length > 1 ? "Documents added" : text}: ${names.join(", ")}`
  }
  return text
}

/** Tone for the event's badge in the Activity list. */
export function auditEventTone(type: string): "success" | "error" | "warning" | "info" | "outline" {
  if (type === "envelope.completed" || type === "recipient.signed" || type === "certificate.issued")
    return "success"
  if (
    type === "envelope.voided" ||
    type === "envelope.declined" ||
    type === "recipient.declined" ||
    type === "recipient.otp_failed"
  )
    return "error"
  if (type === "envelope.expired") return "warning"
  if (type === "envelope.sent" || type === "recipient.notified") return "info"
  return "outline"
}
