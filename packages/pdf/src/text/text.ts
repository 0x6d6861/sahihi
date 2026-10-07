import type { PDFFont } from "pdf-lib"

/**
 * Scripts that need complex shaping (contextual joining, reordering, conjuncts) or right-to-left
 * layout. pdf-lib places glyphs one by one without shaping, so these would render wrongly even
 * when the font has the glyphs: Hebrew, Arabic, Syriac, Thaana, N'Ko, Indic scripts, Thai, Lao,
 * Tibetan, Myanmar, Khmer, and the Arabic/Hebrew presentation forms.
 */
const SHAPED_RANGES: readonly [number, number][] = [
  [0x0590, 0x08ff],
  [0x0900, 0x0dff],
  [0x0e00, 0x0fff],
  [0x1000, 0x109f],
  [0x1780, 0x17ff],
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfeff],
]

export function needsShaping(codePoint: number): boolean {
  return SHAPED_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi)
}

const coverage = new WeakMap<PDFFont, Set<number> | null>()

/** Code points an embedded (fontkit) font has glyphs for; null for the standard 14 fonts. */
function charset(font: PDFFont): Set<number> | null {
  if (!coverage.has(font)) {
    let set: Set<number> | null = null
    try {
      set = new Set(font.getCharacterSet())
    } catch {
      set = null
    }
    coverage.set(font, set)
  }
  return coverage.get(font) ?? null
}

/**
 * Makes user text safe to draw with `font`: collapses line breaks, and replaces with "?" any
 * character the font has no glyph for, or whose script needs shaping. Stamping never throws on user
 * input, and never draws a mis-shaped word. The exact text is still stored in `Field.value`.
 */
export function sanitizeForFont(text: string, font: PDFFont): string {
  const set = charset(font)
  let out = ""
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    const cp = ch.codePointAt(0) as number
    let ok: boolean
    if (needsShaping(cp)) ok = false
    else if (set) ok = cp === 0x20 || set.has(cp)
    else {
      try {
        font.encodeText(ch)
        ok = true
      } catch {
        ok = false
      }
    }
    out += ok ? ch : "?"
  }
  return out
}

/** Largest font size (≤ max) at which `text` fits inside width × height. */
export function fitFontSize(text: string, font: PDFFont, width: number, height: number, max = 14) {
  let size = Math.min(max, height * 0.75)
  while (size > 4 && font.widthOfTextAtSize(text, size) > width * 0.95) size -= 0.5
  return Math.max(size, 4)
}

/** Greedy word-wrap for certificate paragraphs. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  // Hard-break single tokens that are still too wide (e.g. hashes)
  return lines.flatMap((l) => {
    if (font.widthOfTextAtSize(l, size) <= maxWidth) return [l]
    const parts: string[] = []
    let cur = ""
    for (const ch of l) {
      if (font.widthOfTextAtSize(cur + ch, size) > maxWidth) {
        parts.push(cur)
        cur = ch
      } else cur += ch
    }
    if (cur) parts.push(cur)
    return parts
  })
}
