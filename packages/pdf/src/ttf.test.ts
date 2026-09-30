import { describe, expect, test } from "bun:test"
import fontkit from "@pdf-lib/fontkit"
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib"
import regularPath from "../fonts/NotoSans-Regular.ttf" with { type: "file" }
import { embedUnicodeFont } from "./fonts"
import { glyphOffsets, padGlyphs } from "./ttf"

const raw = new Uint8Array(await Bun.file(regularPath).arrayBuffer())

/** Every FontFile2 (embedded TrueType) in a saved PDF, parsed with fontkit. */
async function embeddedFonts(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf)
  const fonts = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of("Type")) !== PDFName.of("FontDescriptor"))
      continue
    const file = doc.context.lookup(obj.get(PDFName.of("FontFile2")))
    if (file instanceof PDFRawStream) {
      fonts.push(fontkit.create(Buffer.from(decodePDFRawStream(file).decode())))
    }
  }
  return fonts
}

describe("padGlyphs", () => {
  test("pads every glyph to 4 bytes and keeps glyph outlines identical", () => {
    expect(glyphOffsets(raw).some((o) => o % 2 === 1)).toBe(true) // the bundled font needs it
    const padded = padGlyphs(raw)
    expect(glyphOffsets(padded).every((o) => o % 4 === 0)).toBe(true)
    const before = fontkit.create(Buffer.from(raw))
    const after = fontkit.create(Buffer.from(padded))
    expect(after.numGlyphs).toBe(before.numGlyphs)
    for (const ch of "Ngũgĩ Łukasz Анна Αλέξανδρος €") {
      const cp = ch.codePointAt(0) as number
      expect(after.glyphForCodePoint(cp).path.toSVG()).toBe(
        before.glyphForCodePoint(cp).path.toSVG(),
      )
    }
  })

  test("returns already padded fonts unchanged", () => {
    const padded = padGlyphs(raw)
    expect(padGlyphs(padded)).toBe(padded)
  })

  test("subset fonts keep every drawn glyph (fontkit short-loca regression)", async () => {
    const doc = await PDFDocument.create()
    const font = await embedUnicodeFont(doc, "regular")
    doc.addPage().drawText("Certificate of Completion — Ngũgĩ Анна Αλέξανδρος", { font, size: 12 })
    const [subset] = await embeddedFonts(await doc.save())
    if (!subset) throw new Error("no embedded font")
    const blank: number[] = []
    for (let id = 1; id < subset.numGlyphs; id++) {
      const glyph = subset.getGlyph(id)
      if (glyph.advanceWidth > 0 && glyph.path.toSVG() === "") blank.push(id)
    }
    // Only the space glyph has no outline.
    expect(blank.length).toBeLessThanOrEqual(1)
    expect(subset.numGlyphs).toBeGreaterThan(30)
  })
})
