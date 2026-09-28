import type {
  EnvelopeStatus,
  RecipientRole,
  RecipientStatus,
  ReminderAvailability,
} from "@sahihi/core"

const RECIPIENT_STATUS_TEXT: Record<RecipientStatus, string> = {
  PENDING: "waiting for their turn",
  SENT: "invited, not opened yet",
  VIEWED: "opened, not signed yet",
  SIGNED: "signed",
  DECLINED: "declined",
}

const ENVELOPE_STATUS_TEXT: Record<EnvelopeStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  VOIDED: "Voided",
  EXPIRED: "Expired",
}

const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`

/**
 * Plain-text summary for "Copy status" (to paste into an email or chat). No links: raw signing
 * links are never stored, so they can't be copied.
 */
export function statusSummary(envelope: {
  title: string
  status: EnvelopeStatus
  expiresAt: string | null
  recipients: {
    name: string
    email: string
    role: RecipientRole
    status: RecipientStatus
    signedAt?: string | null
  }[]
}): string {
  const actionable = envelope.recipients.filter((r) => r.role !== "VIEWER")
  const signed = actionable.filter((r) => r.status === "SIGNED").length
  const lines = [
    `${envelope.title}: ${ENVELOPE_STATUS_TEXT[envelope.status]} (${signed} of ${actionable.length} signed)`,
  ]
  if (envelope.expiresAt) lines.push(`Expires ${utc(envelope.expiresAt)}`)
  lines.push("")
  for (const r of envelope.recipients) {
    const state =
      r.role === "VIEWER"
        ? "receives a copy"
        : r.status === "SIGNED" && r.signedAt
          ? `signed ${utc(r.signedAt)}`
          : RECIPIENT_STATUS_TEXT[r.status]
    lines.push(`- ${r.name} <${r.email}>: ${state}`)
  }
  return lines.join("\n")
}

/** Why "Send reminder" is unavailable, in words, or null when it's available. */
export function reminderHint(a: ReminderAvailability): string | null {
  if (a.ok) return null
  switch (a.reason) {
    case "cooldown": {
      const minutes = Math.ceil(a.waitSec / 60)
      return `Available again in ${minutes} min`
    }
    case "already_done":
      return "Already responded"
    case "not_their_turn":
      return "Not their turn yet"
    case "envelope_closed":
      return "Envelope is closed"
  }
}
