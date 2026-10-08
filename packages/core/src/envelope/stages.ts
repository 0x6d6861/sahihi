import type { EnvelopeStatus } from "../shared/enums"

/**
 * Stages of the envelope list (the Status chip, ADR 0036). "In progress" covers sent and partly
 * signed; "Closed" covers declined, voided and expired.
 */
export const ENVELOPE_STAGES = ["drafts", "active", "completed", "closed"] as const
export type EnvelopeStage = (typeof ENVELOPE_STAGES)[number]

export const ENVELOPE_STAGE_STATUSES: Record<EnvelopeStage, readonly EnvelopeStatus[]> = {
  drafts: ["DRAFT"],
  active: ["SENT", "IN_PROGRESS"],
  completed: ["COMPLETED"],
  closed: ["DECLINED", "VOIDED", "EXPIRED"],
}

/** The stage an envelope in `status` is listed under. */
export function envelopeStage(status: EnvelopeStatus): EnvelopeStage {
  for (const stage of ENVELOPE_STAGES) {
    if (ENVELOPE_STAGE_STATUSES[stage].includes(status)) return stage
  }
  throw new Error(`No stage for ${status}`)
}
