import type { EnvelopeStatus, RecipientStatus } from "./enums"

/**
 * Envelope lifecycle. The ONLY place allowed transitions are defined.
 *
 *   DRAFT ──send──▶ SENT ──first view/sign──▶ IN_PROGRESS ──all signed──▶ COMPLETED
 *     │               │                           │
 *     └──(delete)     ├──decline──▶ DECLINED ◀────┤
 *                     ├──void─────▶ VOIDED   ◀────┤
 *                     └──expire───▶ EXPIRED  ◀────┘
 */
const TRANSITIONS: Record<EnvelopeStatus, readonly EnvelopeStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["IN_PROGRESS", "COMPLETED", "DECLINED", "VOIDED", "EXPIRED"],
  IN_PROGRESS: ["COMPLETED", "DECLINED", "VOIDED", "EXPIRED"],
  COMPLETED: [],
  DECLINED: [],
  VOIDED: [],
  EXPIRED: [],
}

export const TERMINAL_ENVELOPE_STATUSES: readonly EnvelopeStatus[] = [
  "COMPLETED",
  "DECLINED",
  "VOIDED",
  "EXPIRED",
]

export function canTransition(from: EnvelopeStatus, to: EnvelopeStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: EnvelopeStatus,
    readonly to: EnvelopeStatus,
  ) {
    super(`Invalid envelope transition ${from} → ${to}`)
    this.name = "InvalidTransitionError"
  }
}

export function assertTransition(from: EnvelopeStatus, to: EnvelopeStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to)
}

export function isTerminal(status: EnvelopeStatus): boolean {
  return TERMINAL_ENVELOPE_STATUSES.includes(status)
}

/** Fields/recipients may only be edited while the envelope is a draft. */
export function isEditable(status: EnvelopeStatus): boolean {
  return status === "DRAFT"
}

const RECIPIENT_TRANSITIONS: Record<RecipientStatus, readonly RecipientStatus[]> = {
  PENDING: ["SENT"],
  SENT: ["VIEWED", "SIGNED", "DECLINED"],
  VIEWED: ["SIGNED", "DECLINED"],
  SIGNED: [],
  DECLINED: [],
}

export function canTransitionRecipient(from: RecipientStatus, to: RecipientStatus): boolean {
  return RECIPIENT_TRANSITIONS[from].includes(to)
}
