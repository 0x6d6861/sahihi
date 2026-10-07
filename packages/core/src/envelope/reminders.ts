import type { EnvelopeStatus, RecipientStatus } from "../shared/enums"
import { isTerminal } from "./envelope-state"

/**
 * Manual reminders from the sender (docs/signing-flow.md → Sender actions). Each one emails the
 * recipient and rotates their link, so they're throttled: at most one per hour per recipient,
 * counted from the latest invite or reminder. The API enforces this; the UI uses the same helper
 * to explain why "Send reminder" is disabled.
 */
export const MANUAL_REMINDER_COOLDOWN_MS = 60 * 60 * 1000

export type ReminderAvailability =
  | { ok: true }
  | { ok: false; reason: "envelope_closed" | "not_their_turn" | "already_done" }
  | { ok: false; reason: "cooldown"; waitSec: number }

export function reminderAvailability(
  recipient: {
    status: RecipientStatus
    notifiedAt: Date | null
    lastRemindedAt: Date | null
  },
  envelopeStatus: EnvelopeStatus,
  now: Date = new Date(),
): ReminderAvailability {
  if (isTerminal(envelopeStatus) || envelopeStatus === "DRAFT") {
    return { ok: false, reason: "envelope_closed" }
  }
  if (recipient.status === "SIGNED" || recipient.status === "DECLINED") {
    return { ok: false, reason: "already_done" }
  }
  // PENDING = not invited yet (a later step in a sequential envelope).
  if (recipient.status === "PENDING") return { ok: false, reason: "not_their_turn" }

  const last = Math.max(
    recipient.notifiedAt?.getTime() ?? 0,
    recipient.lastRemindedAt?.getTime() ?? 0,
  )
  const remaining = last + MANUAL_REMINDER_COOLDOWN_MS - now.getTime()
  if (last > 0 && remaining > 0) {
    return { ok: false, reason: "cooldown", waitSec: Math.ceil(remaining / 1000) }
  }
  return { ok: true }
}
