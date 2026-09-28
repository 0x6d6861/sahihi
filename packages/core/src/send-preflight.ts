import type { FieldType, RecipientRole, VerificationMethod } from "./enums"

/**
 * Checks an envelope must pass before `DRAFT → SENT` (docs/signing-flow.md → Sending).
 * Returns EVERY problem, so the sender can fix them in one go. The API refuses to send while any
 * issue remains; the web app shows the same list inline.
 */

export type PreflightCode =
  | "no_signers"
  | "missing_signature_field"
  | "missing_phone"
  | "expiry_in_past"

export interface PreflightIssue {
  code: PreflightCode
  message: string
  recipientId?: string
}

export interface PreflightInput {
  recipients: {
    id: string
    name: string
    role: RecipientRole
    verification: VerificationMethod
    phone: string | null
  }[]
  fields: { recipientId: string; type: FieldType }[]
  expiresAt: Date | null
}

export function sendPreflight(input: PreflightInput, now: Date = new Date()): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const actionable = input.recipients.filter((r) => r.role !== "VIEWER")
  if (actionable.length === 0) {
    issues.push({
      code: "no_signers",
      message: "Add at least one recipient who signs or approves.",
    })
  }
  for (const r of actionable) {
    if (
      r.role === "SIGNER" &&
      !input.fields.some((f) => f.recipientId === r.id && f.type === "SIGNATURE")
    ) {
      issues.push({
        code: "missing_signature_field",
        message: `${r.name} needs at least one signature field.`,
        recipientId: r.id,
      })
    }
    if (r.verification === "SMS_OTP" && !r.phone) {
      issues.push({
        code: "missing_phone",
        message: `${r.name} needs a phone number for SMS verification.`,
        recipientId: r.id,
      })
    }
  }
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    issues.push({ code: "expiry_in_past", message: "The expiry date is in the past." })
  }
  return issues
}
