import type { EnvelopeStatus } from "@sahihi/core"

/**
 * Views of the envelope list (`?view=`): one segmented control over the same data. "In progress"
 * covers sent and partly signed; "Closed" covers declined, voided and expired.
 */
export const ENVELOPE_VIEWS = ["all", "drafts", "active", "completed", "closed"] as const
export type EnvelopeView = (typeof ENVELOPE_VIEWS)[number]

export const ENVELOPE_VIEW_LABEL: Record<EnvelopeView, string> = {
  all: "All",
  drafts: "Drafts",
  active: "In progress",
  completed: "Completed",
  closed: "Closed",
}

const VIEW_OF: Record<EnvelopeStatus, Exclude<EnvelopeView, "all">> = {
  DRAFT: "drafts",
  SENT: "active",
  IN_PROGRESS: "active",
  COMPLETED: "completed",
  DECLINED: "closed",
  VOIDED: "closed",
  EXPIRED: "closed",
}

export function parseEnvelopeView(raw: string | string[] | undefined): EnvelopeView {
  return typeof raw === "string" && (ENVELOPE_VIEWS as readonly string[]).includes(raw)
    ? (raw as EnvelopeView)
    : "all"
}

export const inView = (status: EnvelopeStatus, view: EnvelopeView) =>
  view === "all" || VIEW_OF[status] === view

/** How many envelopes fall in each view. */
export function viewCounts(statuses: EnvelopeStatus[]): Record<EnvelopeView, number> {
  const counts = { all: statuses.length, drafts: 0, active: 0, completed: 0, closed: 0 }
  for (const s of statuses) counts[VIEW_OF[s]] += 1
  return counts
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
