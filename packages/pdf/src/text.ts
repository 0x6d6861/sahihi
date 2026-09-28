import type { PDFFont } from "pdf-lib"

/**
 * Standard 14 fonts only support WinAnsi. Replace anything the font can't
 * encode so stamping never throws on user input. (Embed a Unicode TTF via
 * @pdf-lib/fontkit if non-Latin scripts become a requirement.)
 */
export function sanitizeForFont(text: string, font: PDFFont): string {
  let out = ""
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += "?"
    }
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
