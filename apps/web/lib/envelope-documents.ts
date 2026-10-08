/**
 * Web helpers for multi-document envelopes (ADR 0037). Pure, so they're unit-tested.
 */

/** One of an envelope's documents as the API returns it (`GET /envelopes/:id`). */
export interface EnvelopeDocumentView {
  /** The envelope document: what fields' `envelopeDocumentId` points at. */
  id: string
  /** The library document. */
  documentId: string
  order: number
  name: string
  pageCount: number | null
  pages: { rotation: number }[] | null
  sha256: string | null
  signedSha256: string | null
}

/** A supporting file as the API returns it. */
export interface AttachmentView {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  sha256: string | null
  status: "UPLOADING" | "READY" | "FAILED"
  order: number
}

const MAX_TAB_NAME = 22

/** "1. Lease agreement" for a switcher tab: numbered, `.pdf` dropped, long names cut with "…". */
export function documentTabLabel(index: number, name: string): string {
  const base = name.replace(/\.pdf$/i, "").trim() || "Document"
  const short = base.length > MAX_TAB_NAME ? `${base.slice(0, MAX_TAB_NAME - 1).trimEnd()}…` : base
  return `${index + 1}. ${short}`
}

/** "3 pages" across documents, or "2 documents · 5 pages". */
export function documentsLine(documents: { pageCount: number | null }[]): string {
  const pages = documents.reduce((n, d) => n + (d.pageCount ?? 0), 0)
  const p = `${pages} ${pages === 1 ? "page" : "pages"}`
  return documents.length > 1 ? `${documents.length} documents · ${p}` : p
}

/** Page rotations of one document (index = page - 1), for the field layer. */
export const pageRotationsOf = (d: { pages: { rotation: number }[] | null }) =>
  (d.pages ?? []).map((p) => p.rotation)

/** "12 KB", "1.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
