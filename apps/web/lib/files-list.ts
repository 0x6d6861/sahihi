import {
  DOCUMENT_PERIODS,
  type DocumentPeriod,
  FILE_KINDS,
  FILE_STATUSES,
  type FileKind,
  type FileStatus,
} from "@sahihi/core"
import { LIST_STATUS_LABEL } from "./documents-list"
import { ENVELOPE_STAGE_LABEL } from "./envelope-list"
import {
  clearSearchOnFolderChange,
  type FolderScope,
  parseFolderScope,
  setFolderScope,
} from "./folder-scope"
import { type ListLayout, parseListLayout } from "./list-layout"

/**
 * The All files page's state lives in the URL
 * (`/files?folder=…&q=…&type=…&status=…&owner=…&period=…&tag=…&color=…&page=…&layout=grid`) so it
 * stays a Server Component and links/back work (ADR 0038).
 */
export interface FilesView extends FolderScope {
  type?: FileKind
  /** `envelope:<stage>` or `document:<status>`; implies the type. */
  status?: FileStatus
  /** Who added it: uploader, sender or saver (user id). */
  owner?: string
  period?: DocumentPeriod
  page?: number
  layout?: ListLayout
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  document: "Documents",
  envelope: "Envelopes",
  template: "Templates",
}

/** The Status chip's labels: envelope stages, then document states ("Document ready"). */
export function fileStatusLabel(status: FileStatus): string {
  const [kind, value] = status.split(":") as [string, string]
  return kind === "envelope"
    ? ENVELOPE_STAGE_LABEL[value as keyof typeof ENVELOPE_STAGE_LABEL]
    : `Document ${LIST_STATUS_LABEL[value as keyof typeof LIST_STATUS_LABEL].toLowerCase()}`
}

type RawParams = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "")
const oneOf = <T extends string>(v: string, allowed: readonly T[]) =>
  (allowed as readonly string[]).includes(v) ? (v as T) : undefined

/** Reads the URL; unknown values are dropped rather than sent to the API. */
export function parseFilesView(params: RawParams): FilesView {
  const page = Number.parseInt(one(params.page), 10)
  return {
    ...parseFolderScope(params),
    q: one(params.q).slice(0, 200) || undefined,
    type: oneOf(one(params.type), FILE_KINDS),
    status: oneOf(one(params.status), FILE_STATUSES),
    owner: one(params.owner) || undefined,
    period: oneOf(one(params.period), DOCUMENT_PERIODS),
    page: Number.isFinite(page) && page > 1 ? page : undefined,
    layout: parseListLayout(params.layout),
  }
}

/** Any filter narrowing the list (search included). */
export const hasFileFilters = (v: FilesView) =>
  Boolean(v.q || v.tag || v.color || v.type || v.status || v.owner || v.period)

/**
 * `/files` link for `view` with `patch` applied. Changing anything but the page resets it; opening
 * another folder also clears the search, tag and colour (which span every folder).
 */
export function filesHref(view: FilesView, patch: Partial<FilesView> = {}): string {
  const next: FilesView = { ...view, ...patch }
  if (!("page" in patch)) next.page = undefined
  clearSearchOnFolderChange(view, patch, next)
  const qs = new URLSearchParams()
  setFolderScope(qs, next)
  if (next.type) qs.set("type", next.type)
  if (next.status) qs.set("status", next.status)
  if (next.owner) qs.set("owner", next.owner)
  if (next.period) qs.set("period", next.period)
  if (next.page && next.page > 1) qs.set("page", String(next.page))
  if (next.layout) qs.set("layout", next.layout)
  const s = qs.toString()
  return s ? `/files?${s}` : "/files"
}

/** Query string for `GET /api/files`. */
export function filesApiQuery(view: FilesView): string {
  const qs = new URLSearchParams({ page: String(view.page ?? 1) })
  setFolderScope(qs, view, "folderId")
  if (view.type) qs.set("type", view.type)
  if (view.status) qs.set("status", view.status)
  if (view.owner) qs.set("ownerId", view.owner)
  if (view.period) qs.set("period", view.period)
  return qs.toString()
}
