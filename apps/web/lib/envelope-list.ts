import {
  DOCUMENT_PERIODS,
  type DocumentPeriod,
  ENVELOPE_STAGES,
  type EnvelopeStage,
} from "@sahihi/core"
import {
  clearSearchOnFolderChange,
  type FolderScope,
  parseFolderScope,
  setFolderScope,
} from "./folder-scope"
import { type ListLayout, parseListLayout } from "./list-layout"

/**
 * The Envelopes page's state lives in the URL
 * (`/envelopes?folder=…&q=…&tag=…&color=…&stage=…&sender=…&period=…&page=…&layout=grid`) so it
 * stays a Server Component and links/back work (ADR 0036, 0038). These helpers read it, build
 * links and turn it into the API's query.
 */
export interface EnvelopesView extends FolderScope {
  stage?: EnvelopeStage
  sender?: string
  period?: DocumentPeriod
  page?: number
  layout?: ListLayout
}

export const ENVELOPE_STAGE_LABEL: Record<EnvelopeStage, string> = {
  drafts: "Drafts",
  active: "In progress",
  completed: "Completed",
  closed: "Closed",
}

type RawParams = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "")
const oneOf = <T extends string>(v: string, allowed: readonly T[]) =>
  (allowed as readonly string[]).includes(v) ? (v as T) : undefined

/** Reads the URL; unknown values are dropped rather than sent to the API. */
export function parseEnvelopesView(params: RawParams): EnvelopesView {
  const page = Number.parseInt(one(params.page), 10)
  return {
    ...parseFolderScope(params),
    q: one(params.q).slice(0, 200) || undefined,
    stage: oneOf(one(params.stage), ENVELOPE_STAGES),
    sender: one(params.sender) || undefined,
    period: oneOf(one(params.period), DOCUMENT_PERIODS),
    page: Number.isFinite(page) && page > 1 ? page : undefined,
    layout: parseListLayout(params.layout),
  }
}

export const hasEnvelopeFilters = (v: EnvelopesView) =>
  Boolean(v.q || v.tag || v.color || v.stage || v.sender || v.period)

/**
 * `/envelopes` link for `view` with `patch` applied. Changing anything but the page resets it;
 * opening another folder also clears the search, tag and colour.
 */
export function envelopesHref(view: EnvelopesView, patch: Partial<EnvelopesView> = {}): string {
  const next: EnvelopesView = { ...view, ...patch }
  if (!("page" in patch)) next.page = undefined
  clearSearchOnFolderChange(view, patch, next)
  const qs = new URLSearchParams()
  setFolderScope(qs, next)
  if (next.stage) qs.set("stage", next.stage)
  if (next.sender) qs.set("sender", next.sender)
  if (next.period) qs.set("period", next.period)
  if (next.page && next.page > 1) qs.set("page", String(next.page))
  if (next.layout) qs.set("layout", next.layout)
  const s = qs.toString()
  return s ? `/envelopes?${s}` : "/envelopes"
}

/** Query string for `GET /api/envelopes`. */
export function envelopesApiQuery(view: EnvelopesView): string {
  const qs = new URLSearchParams({ page: String(view.page ?? 1) })
  setFolderScope(qs, view, "folderId")
  if (view.stage) qs.set("stage", view.stage)
  if (view.sender) qs.set("senderId", view.sender)
  if (view.period) qs.set("period", view.period)
  return qs.toString()
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
