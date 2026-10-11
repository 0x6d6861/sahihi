import { ImportError, type ImportedBlock, MAX_IMPORT_BYTES, pdfTextToBlocks } from "@sahihi/core"
import { inspectPdf, PdfInspectionError } from "../parse/inspect"
import { readPageText } from "../parse/page-text"
import { readDocxBlocks } from "./docx"

export type ImportFormat = "pdf" | "docx"

/**
 * What a file is, from its first bytes, never its name: a PDF, or a ZIP holding a Word body. Null
 * for anything else (an old .doc, a spreadsheet, a renamed program).
 */
export function sniffImportFormat(bytes: Uint8Array): ImportFormat | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024))
  if (head.includes("%PDF-")) return "pdf"
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // A ZIP; Word's body part name sits in the central directory near the end.
    const tail = new TextDecoder("latin1").decode(
      bytes.subarray(Math.max(0, bytes.length - 65_536)),
    )
    return tail.includes("word/document.xml") ? "docx" : null
  }
  return null
}

/**
 * A PDF's or Word file's content as import blocks (docs/ai-documents.md → Import). Throws
 * `ImportError`: `too_large` over 10 MB, `unsupported` for other files or broken ones, `encrypted`
 * for a password-protected PDF, `no_text` when there's nothing to read (a scan).
 */
export async function readForImport(
  bytes: Uint8Array,
): Promise<{ format: ImportFormat; blocks: ImportedBlock[] }> {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ImportError("too_large")
  const format = sniffImportFormat(bytes)
  if (format === "docx") return { format, blocks: readDocxBlocks(bytes) }
  if (format !== "pdf") throw new ImportError("unsupported")
  try {
    await inspectPdf(bytes)
  } catch (err) {
    if (err instanceof PdfInspectionError) {
      if (err.code === "ENCRYPTED") throw new ImportError("encrypted")
      if (err.code === "EMPTY") throw new ImportError("no_text")
      if (err.code === "TOO_MANY_PAGES") throw new ImportError("too_large")
    }
    throw new ImportError("unsupported")
  }
  let pages: string[]
  try {
    pages = (await readPageText(bytes)).map((p) => p.text)
  } catch {
    throw new ImportError("unsupported")
  }
  if (!pages.some((p) => p.trim())) throw new ImportError("no_text")
  return { format, blocks: pdfTextToBlocks(pages) }
}
