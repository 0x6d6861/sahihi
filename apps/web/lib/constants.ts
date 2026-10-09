import type { DocumentStatus, EnvelopeStatus, FieldType, RecipientStatus } from "@sahihi/core"

/**
 * Arc badge tones (`components/arc/badge`). Status colour means status: success = done, danger =
 * failed or declined, warning = needs attention, info = moving along, neutral = idle or closed.
 */
export type BadgeTone = "neutral" | "success" | "info" | "warning" | "danger"
type BadgeStyle = { label: string; tone: BadgeTone }

export const ENVELOPE_STATUS_BADGE: Record<EnvelopeStatus, BadgeStyle> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
  VOIDED: { label: "Voided", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "warning" },
}

export const DOCUMENT_STATUS_BADGE: Record<DocumentStatus, BadgeStyle> = {
  UPLOADING: { label: "Uploading", tone: "neutral" },
  READY: { label: "Ready", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
}

/** A recipient's progress, as the sender sees it. PENDING = not their turn yet. */
export const RECIPIENT_STATUS_BADGE: Record<RecipientStatus, BadgeStyle> = {
  PENDING: { label: "Waiting", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  VIEWED: { label: "Viewed", tone: "info" },
  SIGNED: { label: "Signed", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
}

export const FIELD_LABELS: Record<FieldType, string> = {
  SIGNATURE: "Signature",
  INITIALS: "Initials",
  DATE_SIGNED: "Date signed",
  NAME: "Full name",
  EMAIL: "Email",
  TEXT: "Text",
  CHECKBOX: "Checkbox",
}

/**
 * Recipient colours for the field editor, as Tailwind classes using theme
 * tokens only (no hard-coded hex). Index = Recipient.colorIndex % length.
 */
/**
 * A placed field's label (editor and preview): centred, and sized from the field's height (the
 * field is a size container) between 10 and 16 px, so it stays readable at any zoom.
 */
export const FIELD_LABEL_CLASS =
  "truncate text-center font-medium text-[clamp(10px,35cqh,16px)] leading-none"

export const RECIPIENT_COLORS = [
  "border-info bg-info/10 text-info-foreground",
  "border-success bg-success/10 text-success-foreground",
  "border-warning bg-warning/10 text-warning-foreground",
  "border-destructive bg-destructive/10 text-destructive-foreground",
  "border-primary bg-primary/10 text-primary",
] as const
