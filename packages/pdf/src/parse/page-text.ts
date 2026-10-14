import type { WrappedPdfiumModule } from "@embedpdf/pdfium"
import type { PageText, PdfRect, PdfTextSpan } from "@sahihi/core"
import { loadPdfium, pdfiumHeap } from "../pdfium"

/** Drawn paths thinner than this (points) in either direction may be rules; others are skipped. */
const RULE_MAX_THICKNESS_PT = 3
const RULE_MIN_LENGTH_PT = 20
const FPDF_PAGEOBJ_PATH = 2
const FPDF_TEXTRENDERMODE_FILL_STROKE = 2
/** Font descriptor flags (PDF 32000 §9.8.2): Italic is bit 7, ForceBold bit 19. */
const FONT_ITALIC = 1 << 6
const FONT_FORCE_BOLD = 1 << 18
const BOLD_NAME = /bold|black|heavy|semibold|demibold|extrabold|ultrabold/i
const ITALIC_NAME = /italic|oblique|slanted|inclined/i
/** An underline is a thin rule at most this thick, at most this far below the baseline (× size). */
const UNDERLINE_MAX_THICKNESS_PT = 1.5
const UNDERLINE_MAX_DROP = 0.4

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
  /**
   * Also return the text's styles as `PageText.spans` (document import): bold and italic from
   * each text object's font (name, weight, flags, italic angle, fill-and-stroke "fake bold",
   * a slanted matrix), its size, and underline from thin rules drawn just under the baseline.
   */
  styles?: boolean
}

/**
 * Every page's text, one UTF-16 code unit per PDF character (characters outside the BMP become
 * U+FFFD so indexes line up), with glyph boxes in PDF user space (unrotated, like a widget /Rect)
 * for the ranges `measure` returns. Paths inside form XObjects aren't visited.
 */
export async function readPageText(
  bytes: Uint8Array,
  { measure = () => [], lines = false, styles = false }: ReadPageTextOptions = {},
): Promise<PageText[]> {
  const m = await loadPdfium()
  const { wasmExports, UTF16ToString } = m.pdfium
  const heap = () => pdfiumHeap(m)
  // Everything below is synchronous, so concurrent calls can't interleave on the shared module.
  const data = wasmExports.malloc(bytes.byteLength)
  const box = wasmExports.malloc(6 * 8)
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
        const spans = styles && page && textPage && text ? pageStyles(page, textPage, text) : null
        if (textPage) m.FPDFText_ClosePage(textPage)
        if (page) m.FPDF_ClosePage(page)
        pages.push({
          page: i + 1,
          text,
          boxes,
          ...(rules ? { lines: rules } : {}),
          ...(spans ? { spans } : {}),
        })
      }
      return pages
    } finally {
      m.FPDF_CloseDocument(doc)
    }
  } finally {
    wasmExports.free(box)
    wasmExports.free(data)
  }

  /**
   * The page's text in runs of one style. A text object (one font, one size) is read once; the
   * characters PDFium adds itself (spaces, line breaks) take the style before them.
   */
  function pageStyles(page: number, textPage: number, text: string): PdfTextSpan[] {
    type Style = { bold: boolean; italic: boolean; size: number }
    const byObject = new Map<number, Style>()
    const chars: (Style | null)[] = []
    let previous: Style | null = null
    for (let c = 0; c < text.length; c++) {
      const obj = m.FPDFText_GetTextObject(textPage, c)
      let style: Style | null = null
      if (obj) {
        style = byObject.get(obj) ?? objectStyle(obj, textPage, c)
        byObject.set(obj, style)
      }
      const own: Style | null = style ?? previous
      chars.push(own)
      previous = own
    }
    const underlined = underlinedChars(page, textPage, text, chars)
    const spans: PdfTextSpan[] = []
    for (let c = 0; c < text.length; c++) {
      const s = chars[c]
      const span = {
        bold: s?.bold ?? false,
        italic: s?.italic ?? false,
        underline: underlined.has(c),
        size: s?.size ?? 0,
      }
      const last = spans[spans.length - 1]
      if (
        last &&
        last.bold === span.bold &&
        last.italic === span.italic &&
        last.underline === span.underline &&
        last.size === span.size
      ) {
        last.end = c + 1
      } else spans.push({ start: c, end: c + 1, ...span })
    }
    return spans
  }

  function objectStyle(obj: number, textPage: number, c: number) {
    const font = m.FPDFTextObj_GetFont(obj)
    let name = ""
    let flags = 0
    let weight = -1
    let angle = 0
    if (font) {
      const buf = wasmExports.malloc(256)
      try {
        const n = m.FPDFFont_GetBaseFontName(font, buf, 256)
        if (n > 1) name = new TextDecoder("latin1").decode(heap().HEAPU8.slice(buf, buf + n - 1))
        flags = m.FPDFFont_GetFlags(font)
        weight = m.FPDFFont_GetWeight(font)
        if (m.FPDFFont_GetItalicAngle(font, buf)) {
          angle = new DataView(heap().HEAPU8.buffer).getInt32(buf, true)
        }
      } finally {
        wasmExports.free(buf)
      }
    }
    // Without the subset tag ("ABCDEF+Calibri-Bold").
    name = name.replace(/^[A-Z]{6}\+/, "")
    // A slanted matrix is an italic made from an upright font: a, b, c, d of [a b c d e f].
    let slanted = false
    if (m.FPDFPageObj_GetMatrix(obj, box)) {
      const [a = 1, b = 0, skew = 0, d = 1] = heap().HEAPF32.subarray(box / 4, box / 4 + 4)
      slanted = Math.abs(b) < 0.01 * Math.abs(a) && Math.abs(skew) > 0.1 * Math.abs(d)
    }
    const fakeBold = m.FPDFTextObj_GetTextRenderMode(obj) === FPDF_TEXTRENDERMODE_FILL_STROKE
    return {
      bold: BOLD_NAME.test(name) || weight >= 600 || (flags & FONT_FORCE_BOLD) !== 0 || fakeBold,
      italic: ITALIC_NAME.test(name) || (flags & FONT_ITALIC) !== 0 || angle !== 0 || slanted,
      size: Math.round(m.FPDFText_GetFontSize(textPage, c) * 2) / 2,
    }
  }

  /**
   * Characters with a thin rule drawn just under their baseline, the rule no wider than them
   * (give or take a character): a table border or a signature line is neither.
   */
  function underlinedChars(
    page: number,
    textPage: number,
    text: string,
    chars: readonly ({ size: number } | null)[],
  ): Set<number> {
    const out = new Set<number>()
    const rules: PdfRect[] = []
    const n = m.FPDFPage_CountObjects(page)
    for (let o = 0; o < n; o++) {
      const obj = m.FPDFPage_GetObject(page, o)
      if (!obj || m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_PATH) continue
      if (!m.FPDFPageObj_GetBounds(obj, box, box + 4, box + 8, box + 12)) continue
      const [left = 0, bottom = 0, right = 0, top = 0] = heap().HEAPF32.subarray(
        box / 4,
        box / 4 + 4,
      )
      if (top - bottom <= UNDERLINE_MAX_THICKNESS_PT && right - left >= 2) {
        rules.push({ x: left, y: bottom, width: right - left, height: top - bottom })
      }
    }
    if (rules.length === 0) return out
    // Baseline origins of the characters a rule could be under.
    const origins: { c: number; x: number; y: number; size: number }[] = []
    for (let c = 0; c < text.length; c++) {
      const size = chars[c]?.size ?? 0
      if (!size || /\s/.test(text[c] ?? " ") || m.FPDFText_IsGenerated(textPage, c)) continue
      if (!m.FPDFText_GetCharOrigin(textPage, c, box, box + 8)) continue
      const [x = 0, y = 0] = heap().HEAPF64.subarray(box / 8, box / 8 + 2)
      origins.push({ c, x, y, size })
    }
    for (const rule of rules) {
      const ruleY = rule.y + rule.height / 2
      const above = origins.filter(
        (o) =>
          o.x >= rule.x - 1 &&
          // The character after an underlined word starts where the rule ends: not under it.
          o.x + 0.15 * o.size <= rule.x + rule.width &&
          o.y - ruleY > -0.05 * o.size &&
          o.y - ruleY <= UNDERLINE_MAX_DROP * o.size,
      )
      if (above.length === 0) continue
      const first = Math.min(...above.map((o) => o.x))
      const last = Math.max(...above.map((o) => o.x + o.size * 0.6))
      const size = Math.max(...above.map((o) => o.size))
      if (rule.width > last - first + 1.5 * size) continue
      for (const o of above) out.add(o.c)
    }
    return out
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
