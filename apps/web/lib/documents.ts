const MAX_TITLE_LENGTH = 200

/** Default envelope title for a document: its file name without `.pdf`, within the schema limit. */
export function envelopeTitleFromFileName(name: string): string {
  const title = name
    .replace(/\.pdf$/i, "")
    .replace(/[_\s]+/g, " ")
    .trim()
  return (title || "Untitled envelope").slice(0, MAX_TITLE_LENGTH)
}

/** First and last characters of a hex digest, for display next to a full value in a tooltip. */
export function shortHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 1) return hash
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`
}

/** File name for a document saved from "Prepare document": `Lease.pdf` → `Lease (prepared).pdf`. */
export function preparedFileName(name: string): string {
  const suffix = " (prepared).pdf"
  const base =
    name
      .replace(/\.pdf$/i, "")
      .replace(/ \(prepared\)$/, "")
      .trim() || "document"
  return `${base.slice(0, MAX_TITLE_LENGTH - suffix.length)}${suffix}`
}
