import type { EnvelopeStatus, FieldType } from "@sahihi/core"

/** Badge variants available in coss: default, secondary, outline, info, success, warning, error, destructive */
export const ENVELOPE_STATUS_BADGE: Record<
  EnvelopeStatus,
  { label: string; variant: "secondary" | "info" | "warning" | "success" | "error" | "outline" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SENT: { label: "Sent", variant: "info" },
  IN_PROGRESS: { label: "In progress", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "success" },
  DECLINED: { label: "Declined", variant: "error" },
  VOIDED: { label: "Voided", variant: "outline" },
  EXPIRED: { label: "Expired", variant: "outline" },
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
export const RECIPIENT_COLORS = [
  "border-info bg-info/10 text-info-foreground",
  "border-success bg-success/10 text-success-foreground",
  "border-warning bg-warning/10 text-warning-foreground",
  "border-destructive bg-destructive/10 text-destructive-foreground",
  "border-primary bg-primary/10 text-primary",
] as const
