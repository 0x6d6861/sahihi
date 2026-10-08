/**
 * List or grid on the All files, Documents, Envelopes and Templates pages (ADR 0033, 0036, 0038). The last choice
 * on each page is saved in its own cookie so the page opens the same way next time; a
 * `?layout=list|grid` link wins over the cookie and is saved too.
 */
export type ListLayout = "list" | "grid"
export type ListPage = "files" | "documents" | "envelopes" | "templates"

export const LIST_LAYOUTS = ["list", "grid"] as const

export const LIST_LAYOUT_COOKIE: Record<ListPage, string> = {
  files: "sahihi-files-layout",
  documents: "sahihi-documents-layout",
  envelopes: "sahihi-envelopes-layout",
  templates: "sahihi-templates-layout",
}

/** One year, in seconds. */
const MAX_AGE = 60 * 60 * 24 * 365

export function listLayoutCookie(page: ListPage, layout: ListLayout): string {
  return `${LIST_LAYOUT_COOKIE[page]}=${layout}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`
}

/** The layout to render: the URL's if it names one, else the saved cookie, else the list. */
export function resolveListLayout(
  fromUrl: ListLayout | undefined,
  cookie: string | undefined,
): ListLayout {
  return fromUrl ?? (cookie === "grid" ? "grid" : "list")
}

/** `?layout=` from the URL; anything else is dropped. */
export function parseListLayout(raw: string | string[] | undefined): ListLayout | undefined {
  return raw === "list" || raw === "grid" ? raw : undefined
}
