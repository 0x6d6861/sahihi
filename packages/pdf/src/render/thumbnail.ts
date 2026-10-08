import { crc32, deflateSync } from "node:zlib"
import { loadPdfium, pdfiumHeap } from "../pdfium"

/** Pixel width of a document thumbnail: a ~240px card at 2x density. */
export const THUMBNAIL_WIDTH = 480
/**
 * Tallest thumbnail, as height / width. Longer pages (receipts, statements) keep their top part,
 * which is what identifies them; the card frames at most A4 portrait (≈1.41) anyway.
 */
export const THUMBNAIL_MAX_ASPECT = 1.5

const FPDF_ANNOT = 0x01
const WHITE = 0xffffffff

export interface Thumbnail {
  png: Uint8Array
  width: number
  height: number
}

/**
 * Renders the first page as a PNG, as displayed (the page's /Rotate applied), on white, with
 * annotations and form field appearances. The top of a page taller than `THUMBNAIL_MAX_ASPECT`
 * is kept. Throws if PDFium can't open the file or it has no pages.
 */
export async function renderThumbnail(
  bytes: Uint8Array,
  { width = THUMBNAIL_WIDTH }: { width?: number } = {},
): Promise<Thumbnail> {
  const m = await loadPdfium()
  const { wasmExports } = m.pdfium
  // Everything below is synchronous, so concurrent calls can't interleave on the shared module.
  const data = wasmExports.malloc(bytes.byteLength)
  try {
    pdfiumHeap(m).HEAPU8.set(bytes, data)
    const doc = m.FPDF_LoadMemDocument(data, bytes.byteLength, "")
    if (!doc) throw new Error("PDFium could not open the document")
    try {
      const page = m.FPDF_GetPageCount(doc) > 0 ? m.FPDF_LoadPage(doc, 0) : 0
      if (!page) throw new Error("The document has no pages")
      try {
        // Page size as displayed: PDFium swaps width and height for /Rotate 90 and 270.
        const pageWidth = m.FPDF_GetPageWidthF(page)
        const pageHeight = m.FPDF_GetPageHeightF(page)
        if (!(pageWidth > 0 && pageHeight > 0)) throw new Error("The first page has no size")
        const fullHeight = Math.max(1, Math.round((width * pageHeight) / pageWidth))
        const height = Math.min(fullHeight, Math.round(width * THUMBNAIL_MAX_ASPECT))

        // BGRx, 4 bytes a pixel. The page is laid out at full height; the bitmap clips the bottom.
        const bitmap = m.FPDFBitmap_Create(width, height, 0)
        if (!bitmap) throw new Error("PDFium could not allocate the bitmap")
        try {
          m.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, WHITE)
          m.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, fullHeight, 0, FPDF_ANNOT)
          const stride = m.FPDFBitmap_GetStride(bitmap)
          const buffer = m.FPDFBitmap_GetBuffer(bitmap)
          const bgrx = pdfiumHeap(m).HEAPU8.subarray(buffer, buffer + stride * height)
          return { png: encodePng(bgrx, width, height, stride), width, height }
        } finally {
          m.FPDFBitmap_Destroy(bitmap)
        }
      } finally {
        m.FPDF_ClosePage(page)
      }
    } finally {
      m.FPDF_CloseDocument(doc)
    }
  } finally {
    wasmExports.free(data)
  }
}

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const FILTER_SUB = 1

/**
 * 8-bit RGB PNG from a BGRx buffer (PDFium's bitmap layout). Each row uses the Sub filter, which
 * suits rendered pages (long runs of white) and keeps the encoder a few lines with no dependency.
 */
export function encodePng(bgrx: Uint8Array, width: number, height: number, stride = width * 4) {
  const rowBytes = 1 + width * 3
  const raw = new Uint8Array(rowBytes * height)
  for (let y = 0; y < height; y++) {
    const src = y * stride
    const dst = y * rowBytes
    raw[dst] = FILTER_SUB
    for (let x = 0; x < width; x++) {
      const s = src + x * 4
      const d = dst + 1 + x * 3
      const prev = s - 4
      // Sub: each byte minus the same channel of the pixel to its left (0 for the first pixel).
      raw[d] = (bgrx[s + 2] ?? 0) - (x ? (bgrx[prev + 2] ?? 0) : 0)
      raw[d + 1] = (bgrx[s + 1] ?? 0) - (x ? (bgrx[prev + 1] ?? 0) : 0)
      raw[d + 2] = (bgrx[s] ?? 0) - (x ? (bgrx[prev] ?? 0) : 0)
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  return concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ])
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.byteLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.byteLength)
  out.set(new TextEncoder().encode(type), 4)
  out.set(body, 8)
  view.setUint32(8 + body.byteLength, crc32(out.subarray(4, 8 + body.byteLength)))
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.byteLength
  }
  return out
}
