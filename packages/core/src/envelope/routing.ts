import type { RecipientRole, RecipientStatus, SigningOrder } from "../shared/enums"

export interface RoutingRecipient {
  id: string
  role: RecipientRole
  order: number
  status: RecipientStatus
}

/** Recipients whose action is required for the envelope to complete. */
export function actionableRecipients<T extends RoutingRecipient>(recipients: T[]): T[] {
  return recipients.filter((r) => r.role !== "VIEWER")
}

/**
 * Recipients who should currently be able to act (and be notified).
 * - PARALLEL: every actionable recipient not yet done.
 * - SEQUENTIAL: all not-yet-done actionable recipients sharing the lowest
 *   `order` among those not done. Equal orders form a parallel "step".
 */
export function currentRecipients<T extends RoutingRecipient>(
  recipients: T[],
  signingOrder: SigningOrder,
): T[] {
  const pending = actionableRecipients(recipients).filter(
    (r) => r.status !== "SIGNED" && r.status !== "DECLINED",
  )
  if (signingOrder === "PARALLEL" || pending.length === 0) return pending
  const lowest = Math.min(...pending.map((r) => r.order))
  return pending.filter((r) => r.order === lowest)
}

/** Whether this recipient may open/sign right now. */
export function isRecipientsTurn<T extends RoutingRecipient>(
  recipient: T,
  recipients: T[],
  signingOrder: SigningOrder,
): boolean {
  return currentRecipients(recipients, signingOrder).some((r) => r.id === recipient.id)
}

export type EnvelopeOutcome = "COMPLETED" | "DECLINED" | "IN_PROGRESS"

/** Derive the envelope outcome after a recipient finishes (signs/declines). */
export function deriveOutcome(recipients: RoutingRecipient[]): EnvelopeOutcome {
  const actionable = actionableRecipients(recipients)
  if (actionable.some((r) => r.status === "DECLINED")) return "DECLINED"
  if (actionable.length > 0 && actionable.every((r) => r.status === "SIGNED")) return "COMPLETED"
  return "IN_PROGRESS"
}
