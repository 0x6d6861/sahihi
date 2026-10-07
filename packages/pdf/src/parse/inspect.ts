import { normalizeRotation, type PageBox } from "@sahihi/core"
import { EncryptedPDFError, PDFDocument } from "pdf-lib"

export class PdfInspectionError extends Error {
  constructor(
    message: string,
    readonly code: "ENCRYPTED" | "INVALID" | "EMPTY" | "TOO_MANY_PAGES",
  ) {
    super(message)
    this.name = "PdfInspectionError"
  }
}

export interface PdfInfo {
  pageCount: number
  pages: PageBox[]
}

export const MAX_PAGES = 500

/** Load a PDF and describe its pages. Throws PdfInspectionError for unusable files. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (err) {
    if (err instanceof EncryptedPDFError)
      throw new PdfInspectionError("Password-protected PDFs are not supported", "ENCRYPTED")
    throw new PdfInspectionError("File is not a valid PDF", "INVALID")
  }
  const pages = doc.getPages()
  if (pages.length === 0) throw new PdfInspectionError("PDF has no pages", "EMPTY")
  if (pages.length > MAX_PAGES)
    throw new PdfInspectionError(`PDF exceeds ${MAX_PAGES} pages`, "TOO_MANY_PAGES")

  return {
    pageCount: pages.length,
    pages: pages.map((p) => {
      const box = p.getCropBox()
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        rotation: normalizeRotation(p.getRotation().angle),
      }
    }),
  }
}
