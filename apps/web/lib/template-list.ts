import { DOCUMENT_PERIODS, type DocumentPeriod } from "@sahihi/core"
import {
  clearSearchOnFolderChange,
  type FolderScope,
  parseFolderScope,
  setFolderScope,
} from "./folder-scope"
import { type ListLayout, parseListLayout } from "./list-layout"

/**
 * The Templates page's state lives in the URL
 * (`/templates?folder=…&q=…&tag=…&color=…&by=…&period=…&page=…&layout=grid`) so it stays a Server
 * Component and links/back work (ADR 0036, 0038).
 */
export interface TemplatesView extends FolderScope {
  /** Saved by (user id). */
  by?: string
  period?: DocumentPeriod
  page?: number
  layout?: ListLayout
}

type RawParams = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "")

/** Reads the URL; unknown values are dropped rather than sent to the API. */
export function parseTemplatesView(params: RawParams): TemplatesView {
  const page = Number.parseInt(one(params.page), 10)
  const period = one(params.period)
  return {
    ...parseFolderScope(params),
    q: one(params.q).slice(0, 200) || undefined,
    by: one(params.by) || undefined,
    period: (DOCUMENT_PERIODS as readonly string[]).includes(period)
      ? (period as DocumentPeriod)
      : undefined,
    page: Number.isFinite(page) && page > 1 ? page : undefined,
    layout: parseListLayout(params.layout),
  }
}

export const hasTemplateFilters = (v: TemplatesView) =>
  Boolean(v.q || v.tag || v.color || v.by || v.period)

/**
 * `/templates` link for `view` with `patch` applied. Changing anything but the page resets it;
 * opening another folder also clears the search, tag and colour.
 */
export function templatesHref(view: TemplatesView, patch: Partial<TemplatesView> = {}): string {
  const next: TemplatesView = { ...view, ...patch }
  if (!("page" in patch)) next.page = undefined
  clearSearchOnFolderChange(view, patch, next)
  const qs = new URLSearchParams()
  setFolderScope(qs, next)
  if (next.by) qs.set("by", next.by)
  if (next.period) qs.set("period", next.period)
  if (next.page && next.page > 1) qs.set("page", String(next.page))
  if (next.layout) qs.set("layout", next.layout)
  const s = qs.toString()
  return s ? `/templates?${s}` : "/templates"
}

/** Query string for `GET /api/templates`. */
export function templatesApiQuery(view: TemplatesView): string {
  const qs = new URLSearchParams({ page: String(view.page ?? 1) })
  setFolderScope(qs, view, "folderId")
  if (view.by) qs.set("createdById", view.by)
  if (view.period) qs.set("period", view.period)
  return qs.toString()
}
