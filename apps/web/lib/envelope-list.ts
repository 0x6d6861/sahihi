import type { EnvelopeStage } from "@sahihi/core"

/** Envelope list helpers shared by All files and the envelope page. */

export const ENVELOPE_STAGE_LABEL: Record<EnvelopeStage, string> = {
  drafts: "Drafts",
  active: "In progress",
  completed: "Completed",
  closed: "Closed",
}

/** "Achieng Otieno", "Achieng Otieno and Baraka Mwangi", "Achieng Otieno + 2 more"; "No recipients yet". */
export function recipientSummary(names: string[]): string {
  const [first, second] = names
  if (!first) return "No recipients yet"
  if (names.length === 1) return first
  if (names.length === 2) return `${first} and ${second}`
  return `${first} + ${names.length - 1} more`
}

/** Signing progress over the recipients who act (viewers only get a copy). */
export function signingProgress(recipients: { role: string; status: string }[]) {
  const actors = recipients.filter((r) => r.role !== "VIEWER")
  return { signed: actors.filter((r) => r.status === "SIGNED").length, total: actors.length }
}
