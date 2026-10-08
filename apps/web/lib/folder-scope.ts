import { MAX_TAG_LENGTH, normalizeLabelColor } from "@sahihi/core"

/**
 * The folder and label part of a list page's URL, shared by Documents, Envelopes, Templates and
 * All files (ADR 0022, 0025, 0038): `folder` (the open folder), `tag` and `color`. Search, tag and
 * colour look in every folder rather than the open one.
 */
export interface FolderScope {
  folder?: string
  q?: string
  /** Tag name (case-insensitive). */
  tag?: string
  /** Label colour, `#RRGGBB` (`#` dropped in the URL). */
  color?: string
}

type RawParams = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "")

/** `folder`, `tag` and `color` from the URL; unknown values are dropped. */
export function parseFolderScope(params: RawParams): Pick<FolderScope, "folder" | "tag" | "color"> {
  return {
    folder: one(params.folder) || undefined,
    tag: one(params.tag).slice(0, MAX_TAG_LENGTH) || undefined,
    color: normalizeLabelColor(one(params.color)) ?? undefined,
  }
}

/** Search, tag and colour look in every folder rather than the open one (ADR 0025). */
export const searchesEverywhere = (v: FolderScope) => Boolean(v.q || v.tag || v.color)

/** Opening another folder clears the search, tag and colour (which span every folder). */
export function clearSearchOnFolderChange<T extends FolderScope>(
  view: T,
  patch: Partial<T>,
  next: T,
): void {
  if ("folder" in patch && patch.folder !== view.folder) {
    for (const key of ["q", "tag", "color"] as const) if (!(key in patch)) next[key] = undefined
  }
}

/** Writes `folder` (as `folderKey`), `q`, `tag` and `color` into a query string. */
export function setFolderScope(qs: URLSearchParams, v: FolderScope, folderKey = "folder"): void {
  if (v.folder) qs.set(folderKey, v.folder)
  if (v.q) qs.set("q", v.q)
  if (v.tag) qs.set("tag", v.tag)
  if (v.color) qs.set("color", v.color.replace("#", ""))
}

/** Query string for `GET /api/folders`: one level, or matching folders anywhere when searching. */
export function foldersApiQuery<T extends FolderScope>(view: T): string {
  const qs = new URLSearchParams()
  if (searchesEverywhere(view)) {
    if (view.q) qs.set("q", view.q)
    if (view.tag) qs.set("tag", view.tag)
    if (view.color) qs.set("color", view.color.replace("#", ""))
  } else if (view.folder) {
    qs.set("parentId", view.folder)
  }
  return qs.toString()
}
