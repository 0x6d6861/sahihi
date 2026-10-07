/// <reference path="../assets.d.ts" />
import { isAbsolute, join } from "node:path"
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium"
// Bun copies the WASM next to the bundle (`bun build`) and resolves it to a path in source mode.
import wasmPath from "@embedpdf/pdfium/pdfium.wasm" with { type: "file" }
import type { PageText, PdfRect } from "@sahihi/core"

// PDFium (the same build the web viewer uses) is the text extractor: pdf-lib can't read text.
let pdfium: Promise<WrappedPdfiumModule> | undefined
function loadPdfium(): Promise<WrappedPdfiumModule> {
  pdfium ??= (async () => {
    const path = isAbsolute(wasmPath) ? wasmPath : join(import.meta.dir, wasmPath)
    const m = await init({ wasmBinary: await Bun.file(path).arrayBuffer() })
    m.PDFiumExt_Init()
    return m
  })()
  return pdfium
}

/** Drawn paths thinner than this (points) in either direction may be rules; others are skipped. */
const RULE_MAX_THICKNESS_PT = 3
const RULE_MIN_LENGTH_PT = 20
const FPDF_PAGEOBJ_PATH = 2

export interface ReadPageTextOptions {
  /**
   * The [start, end) ranges of each page's text to measure glyph boxes for, e.g. `anchorRanges`
   * (it also gets the page's drawn rules when `lines` is set)
   * or a `createTextRuleScanner()` from `@sahihi/core`. Measuring every glyph of a long contract
   * costs seconds and hundreds of MB, so ask only for what you need.
   */
  measure?: (text: string, lines: readonly PdfRect[]) => [number, number][]
  /** Also return thin drawn paths (candidate signature lines) as `PageText.lines`. */
  lines?: boolean
}

/**
 * Every page's text, one UTF-16 code unit per PDF character (characters outside the BMP become
 * U+FFFD so indexes line up), with glyph boxes in PDF user space (unrotated, like a widget /Rect)
 * for the ranges `measure` returns. Paths inside form XObjects aren't visited.
 */
export async function readPageText(
  bytes: Uint8Array,
  { measure = () => [], lines = false }: ReadPageTextOptions = {},
): Promise<PageText[]> {
  const m = await loadPdfium()
  const { wasmExports, UTF16ToString } = m.pdfium
  // Emscripten replaces these views when memory grows (malloc), so read them at each use.
  const heap = () =>
    m.pdfium as unknown as { HEAPU8: Uint8Array; HEAPF32: Float32Array; HEAPF64: Float64Array }
  // Everything below is synchronous, so concurrent calls can't interleave on the shared module.
  const data = wasmExports.malloc(bytes.byteLength)
  const box = wasmExports.malloc(4 * 8)
  try {
    heap().HEAPU8.set(bytes, data)
    const doc = m.FPDF_LoadMemDocument(data, bytes.byteLength, "")
    if (!doc) throw new Error("PDFium could not open the document")
    try {
      const pages: PageText[] = []
      const count = m.FPDF_GetPageCount(doc)
      for (let i = 0; i < count; i++) {
        const page = m.FPDF_LoadPage(doc, i)
        const textPage = page ? m.FPDFText_LoadPage(page) : 0
        const text = textPage ? pageString(m, textPage) : ""
        const boxes = new Map<number, PdfRect>()
        const rules = lines && page ? pageRules(page) : undefined
        for (const [start, end] of textPage && text ? measure(text, rules ?? []) : []) {
          for (let c = start; c < end; c++) {
            if (m.FPDFText_IsGenerated(textPage, c)) continue
            // left, right, bottom, top as doubles
            if (!m.FPDFText_GetCharBox(textPage, c, box, box + 8, box + 16, box + 24)) continue
            const [left = 0, right = 0, bottom = 0, top = 0] = heap().HEAPF64.subarray(
              box / 8,
              box / 8 + 4,
            )
            boxes.set(c, { x: left, y: bottom, width: right - left, height: top - bottom })
          }
        }
        if (textPage) m.FPDFText_ClosePage(textPage)
        if (page) m.FPDF_ClosePage(page)
        pages.push({ page: i + 1, text, boxes, ...(rules ? { lines: rules } : {}) })
      }
      return pages
    } finally {
      m.FPDF_CloseDocument(doc)
    }
  } finally {
    wasmExports.free(box)
    wasmExports.free(data)
  }

  /** Bounds of the page's thin path objects: rules, underlines, table borders. */
  function pageRules(page: number): PdfRect[] {
    const rules: PdfRect[] = []
    const n = m.FPDFPage_CountObjects(page)
    for (let o = 0; o < n; o++) {
      const obj = m.FPDFPage_GetObject(page, o)
      if (!obj || m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_PATH) continue
      // left, bottom, right, top as floats
      if (!m.FPDFPageObj_GetBounds(obj, box, box + 4, box + 8, box + 12)) continue
      const [left = 0, bottom = 0, right = 0, top = 0] = heap().HEAPF32.subarray(
        box / 4,
        box / 4 + 4,
      )
      const width = right - left
      const height = top - bottom
      const thin = Math.min(width, height) <= RULE_MAX_THICKNESS_PT
      if (thin && Math.max(width, height) >= RULE_MIN_LENGTH_PT)
        rules.push({ x: left, y: bottom, width, height })
    }
    return rules
  }

  /** The page's characters, one code unit each. One bulk read; per character if that misaligns. */
  function pageString(m: WrappedPdfiumModule, textPage: number): string {
    const n = m.FPDFText_CountChars(textPage)
    if (n <= 0) return ""
    const buf = wasmExports.malloc((n + 1) * 2)
    try {
      const written = m.FPDFText_GetText(textPage, 0, n, buf)
      const text = UTF16ToString(buf, Math.max(0, written - 1) * 2)
      if (text.length === n) return text
    } finally {
      wasmExports.free(buf)
    }
    let text = ""
    for (let c = 0; c < n; c++) {
      const u = m.FPDFText_GetUnicode(textPage, c)
      text += u > 0 && u <= 0xffff ? String.fromCharCode(u) : "�"
    }
    return text
  }
}
