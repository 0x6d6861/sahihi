/**
 * Multi-document envelopes and supporting files (ADR 0037). Pure helpers shared by the API, the
 * worker and the web app.
 */

/** Documents one envelope (or template) can hold. */
export const MAX_ENVELOPE_DOCUMENTS = 10
/** Pages across all of an envelope's documents (each PDF is already capped at 500 by inspectPdf). */
export const MAX_ENVELOPE_PAGES = 500
/** Supporting files per envelope (or template). Each is at most MAX_UPLOAD_BYTES. */
export const MAX_ATTACHMENTS = 10

/**
 * Types a supporting file may have. Office and data formats people send with contracts; no HTML,
 * SVG, scripts or executables. Files are always served as downloads, never inline.
 */
export const ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
] as const
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number]

const BY_EXTENSION: Record<string, AttachmentContentType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
}

/** Accept strings for a file picker (`.pdf,.png,…`). */
export const ATTACHMENT_ACCEPT = Object.keys(BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",")

/**
 * The allowed type for a file, from its MIME type or (browsers often send none for Office files
 * and CSVs) its extension; null when it isn't allowed.
 */
export function attachmentContentType(
  name: string,
  mime: string | null | undefined,
): AttachmentContentType | null {
  const m = (mime ?? "").toLowerCase().split(";")[0]?.trim() ?? ""
  if ((ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(m)) return m as AttachmentContentType
  if (m && m !== "application/octet-stream" && m !== "application/vnd.ms-excel") return null
  const ext = name.toLowerCase().split(".").pop() ?? ""
  return BY_EXTENSION[ext] ?? null
}

/** Rows by their `order`, then creation (stable for equal orders). */
export function byOrder<T extends { order: number; createdAt?: Date | string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.order - b.order || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
  )
}

/**
 * Fields in reading order across an envelope: document order, then page, then top to bottom,
 * then left to right. "Next field" on the signing page walks this list.
 */
export function fieldsInReadingOrder<
  F extends { envelopeDocumentId: string; page: number; y: number; x: number },
>(fields: F[], documentOrder: readonly string[]): F[] {
  const rank = new Map(documentOrder.map((id, i) => [id, i]))
  return [...fields].sort(
    (a, b) =>
      (rank.get(a.envelopeDocumentId) ?? 0) - (rank.get(b.envelopeDocumentId) ?? 0) ||
      a.page - b.page ||
      a.y - b.y ||
      a.x - b.x,
  )
}

/** "Lease.pdf", "Lease.pdf and Annex.pdf", "Lease.pdf + 2 more". */
export function documentsSummary(names: readonly string[]): string {
  const [first, second] = names
  if (!first) return "No documents"
  if (names.length === 1) return first
  if (names.length === 2) return `${first} and ${second}`
  return `${first} + ${names.length - 1} more`
}

/** A file name safe inside a zip and a Content-Disposition: no paths, no control characters. */
export function safeFileName(name: string, fallback = "file"): string {
  const cleaned = name
    .replace(/[\\/]/g, "-")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150)
  return cleaned || fallback
}

/** Zip entry names in order with a numeric prefix, so "Download all" keeps the signing order. */
export function numberedFileName(index: number, name: string): string {
  return `${String(index + 1).padStart(2, "0")}-${safeFileName(name)}`
}
