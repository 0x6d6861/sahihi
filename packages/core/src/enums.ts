// String unions mirrored from prisma/schema.prisma so that code which must not
// import Prisma (the web app, shared validators) can use them.
// Kept in sync by packages/db/src/enums.test.ts.

export const DOCUMENT_STATUSES = ["UPLOADING", "READY", "FAILED"] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const ENVELOPE_STATUSES = [
  "DRAFT",
  "SENT",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
  "VOIDED",
  "EXPIRED",
] as const
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number]

export const SIGNING_ORDERS = ["PARALLEL", "SEQUENTIAL"] as const
export type SigningOrder = (typeof SIGNING_ORDERS)[number]

export const RECIPIENT_ROLES = ["SIGNER", "APPROVER", "VIEWER"] as const
export type RecipientRole = (typeof RECIPIENT_ROLES)[number]

export const RECIPIENT_STATUSES = ["PENDING", "SENT", "VIEWED", "SIGNED", "DECLINED"] as const
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number]

export const VERIFICATION_METHODS = ["LINK", "EMAIL_OTP", "SMS_OTP"] as const
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]

/** EMAIL: invited and reminded by email. EMBEDDED: signs inside the sender's own app (docs/embedded-signing.md). */
export const RECIPIENT_DELIVERIES = ["EMAIL", "EMBEDDED"] as const
export type RecipientDelivery = (typeof RECIPIENT_DELIVERIES)[number]

export const FIELD_TYPES = [
  "SIGNATURE",
  "INITIALS",
  "DATE_SIGNED",
  "NAME",
  "EMAIL",
  "TEXT",
  "CHECKBOX",
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

/** Field types whose value is a PNG image rather than text. */
export const IMAGE_FIELD_TYPES: readonly FieldType[] = ["SIGNATURE", "INITIALS"]

/** Field types filled automatically from recipient data at submit time. */
export const AUTO_FIELD_TYPES: readonly FieldType[] = ["DATE_SIGNED", "NAME", "EMAIL"]

/** Webhook delivery lifecycle (docs/webhooks.md). */
export const WEBHOOK_DELIVERY_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"] as const
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number]
