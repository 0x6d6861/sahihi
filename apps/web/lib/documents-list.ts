import {
  DOCUMENT_LIST_STATUSES,
  DOCUMENT_PERIODS,
  type DocumentPeriod,
  type DocumentStatus,
} from "@sahihi/core"
import {
  clearSearchOnFolderChange,
  type FolderScope,
  parseFolderScope,
  setFolderScope,
} from "./folder-scope"
import { pluralize } from "./format"
import { type ListLayout, parseListLayout } from "./list-layout"

export { foldersApiQuery, searchesEverywhere } from "./folder-scope"

/**
 * The Documents page's state lives in the URL
 * (`/documents?folder=…&q=…&tag=…&color=…&status=…&sender=…&period=…&page=…&layout=grid`) so it stays a Server
 * Component and links/back work. These helpers read it, build links and turn it into the API's
 * query (ADR 0022, 0025).
 */
export interface DocumentsView extends FolderScope {
  status?: (typeof DOCUMENT_LIST_STATUSES)[number]
  sender?: string
  period?: DocumentPeriod
  page?: number
  /**
   * List or thumbnail grid (ADR 0033), only when the URL names one; it then wins over the saved
   * choice and is saved (`lib/list-layout.ts`). Kept across folders, filters and pages.
   */
  layout?: ListLayout
}

export const PERIOD_LABEL: Record<DocumentPeriod, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "This year",
}

export const LIST_STATUS_LABEL: Record<(typeof DOCUMENT_LIST_STATUSES)[number], string> = {
  READY: "Ready",
  FAILED: "Failed",
} satisfies Partial<Record<DocumentStatus, string>>

type RawParams = Record<string, string | string[] | undefined>

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "")
const oneOf = <T extends string>(v: string, allowed: readonly T[]) =>
  (allowed as readonly string[]).includes(v) ? (v as T) : undefined

/** Reads the URL; unknown values are dropped rather than sent to the API. */
export function parseDocumentsView(params: RawParams): DocumentsView {
  const page = Number.parseInt(one(params.page), 10)
  return {
    ...parseFolderScope(params),
    q: one(params.q).slice(0, 200) || undefined,
    status: oneOf(one(params.status), DOCUMENT_LIST_STATUSES),
    sender: one(params.sender) || undefined,
    period: oneOf(one(params.period), DOCUMENT_PERIODS),
    page: Number.isFinite(page) && page > 1 ? page : undefined,
    layout: parseListLayout(params.layout),
  }
}

/** Any filter narrowing the list (search included). */
export const hasFilters = (v: DocumentsView) =>
  Boolean(v.q || v.tag || v.color || v.status || v.sender || v.period)

/**
 * `/documents` link for `view` with `patch` applied. Changing anything but the page goes back to
 * page 1; opening another folder also clears the search, tag and colour (which span every folder).
 */
export function documentsHref(view: DocumentsView, patch: Partial<DocumentsView> = {}): string {
  const next: DocumentsView = { ...view, ...patch }
  if (!("page" in patch)) next.page = undefined
  clearSearchOnFolderChange(view, patch, next)
  const qs = new URLSearchParams()
  setFolderScope(qs, next)
  if (next.status) qs.set("status", next.status)
  if (next.sender) qs.set("sender", next.sender)
  if (next.period) qs.set("period", next.period)
  if (next.page && next.page > 1) qs.set("page", String(next.page))
  if (next.layout) qs.set("layout", next.layout)
  const s = qs.toString()
  return s ? `/documents?${s}` : "/documents"
}

/** Query string for `GET /api/documents`. */
export function documentsApiQuery(view: DocumentsView): string {
  const qs = new URLSearchParams({ page: String(view.page ?? 1) })
  setFolderScope(qs, view, "folderId")
  if (view.status) qs.set("status", view.status)
  if (view.sender) qs.set("senderId", view.sender)
  if (view.period) qs.set("period", view.period)
  return qs.toString()
}

/** "Contracts / Leases" for a folder's path (root first). */
export const folderPathLabel = (path: { name: string }[]) => path.map((p) => p.name).join(" / ")

/** What a folder holds (ADR 0038); envelope and template counts are absent from older callers. */
export interface FolderCounts {
  documentCount: number
  envelopeCount?: number
  templateCount?: number
  folderCount: number
}

/**
 * "3 documents, 2 envelopes, 1 template, 1 folder": only the parts that aren't zero; "Empty" when
 * all are.
 */
export function folderSummary(c: FolderCounts): string {
  const parts = [
    c.documentCount > 0 ? pluralize(c.documentCount, "document") : null,
    c.envelopeCount ? pluralize(c.envelopeCount, "envelope") : null,
    c.templateCount ? pluralize(c.templateCount, "template") : null,
    c.folderCount > 0 ? pluralize(c.folderCount, "folder") : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "Empty"
}

/**
 * The line under a folder's name: where it lives (search results, `path` set; `rootLabel` names
 * the top level) or what's in it.
 */
export function folderMeta(
  folder: FolderCounts & { path?: { name: string }[] },
  rootLabel = "Documents",
): string {
  return folder.path
    ? `In ${folder.path.length > 0 ? folderPathLabel(folder.path) : rootLabel}`
    : folderSummary(folder)
}
