/**
 * What the Documents upload takes (docs/pdf-pipeline.md → Upload): a PDF, stored as it is, or a
 * Word file, which the worker converts to a PDF (ADR 0052). The bytes decide on `complete`; the
 * type here only picks the flow.
 */
export const PDF_CONTENT_TYPE = "application/pdf"
export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const DOCUMENT_UPLOAD_TYPES = [PDF_CONTENT_TYPE, DOCX_CONTENT_TYPE] as const
export type DocumentUploadType = (typeof DOCUMENT_UPLOAD_TYPES)[number]

/** Accept string for the upload file pickers. */
export const DOCUMENT_UPLOAD_ACCEPT = `.pdf,.docx,${PDF_CONTENT_TYPE},${DOCX_CONTENT_TYPE}`

/**
 * The upload type of a file from its MIME type or, when the browser sends none (common for both
 * on some systems), its extension. Null for anything else, an old .doc included.
 */
export function documentUploadType(
  name: string,
  mime: string | null | undefined,
): DocumentUploadType | null {
  const m = (mime ?? "").toLowerCase().split(";")[0]?.trim() ?? ""
  if ((DOCUMENT_UPLOAD_TYPES as readonly string[]).includes(m)) return m as DocumentUploadType
  if (m && m !== "application/octet-stream") return null
  if (/\.pdf$/i.test(name)) return PDF_CONTENT_TYPE
  if (/\.docx$/i.test(name)) return DOCX_CONTENT_TYPE
  return null
}

/**
 * A converted document's name: the Word file's name with a .pdf extension ("Lease.docx" →
 * "Lease.pdf"), since signers and downloads get the PDF.
 */
export function convertedDocumentName(name: string): string {
  const base = name.replace(/\.docx$/i, "").trim() || "document"
  return `${base.slice(0, 196)}.pdf`
}
