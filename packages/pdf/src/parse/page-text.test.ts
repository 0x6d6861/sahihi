import { describe, expect, test } from "bun:test"
import {
  anchorRanges,
  createTextRuleScanner,
  type PageBox,
  suggestFieldsFromAnchors,
  suggestFieldsFromText,
} from "@sahihi/core"
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { readPageText } from "./page-text"

async function anchoredPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([612, 792])
  p1.drawText("Signed: {{s1:signature}}", { x: 72, y: 700, size: 12, font })
  p1.drawText("Date: {{s2:date}}", { x: 72, y: 100, size: 12, font })
  const p2 = doc.addPage([612, 792])
  p2.setRotation(degrees(90))
  p2.drawText("{{buyer:initials:optional}}", { x: 100, y: 100, size: 10, font })
  doc.addPage([612, 792]) // no text at all
  return doc.save()
}

describe("readPageText", () => {
  test("returns each page's text, and glyph boxes only for the measured ranges", async () => {
    const pages = await readPageText(await anchoredPdf(), { measure: anchorRanges })
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3])
    const [p1, p2, p3] = pages
    expect(p1?.text).toContain("{{s1:signature}}")
    expect(p2?.text).toBe("{{buyer:initials:optional}}")
    expect(p3).toEqual({ page: 3, text: "", boxes: new Map() })

    // Every glyph of each tag is measured; nothing outside the tags is.
    const start = p1?.text.indexOf("{{s1") ?? -1
    expect(p1?.boxes.has(start - 2)).toBe(false)
    for (let i = start; i < start + "{{s1:signature}}".length; i++) {
      expect(p1?.boxes.has(i)).toBe(true)
    }
    // The first "{" sits on the 700pt baseline, after "Signed: "
    const b = p1?.boxes.get(start)
    expect(b?.x).toBeGreaterThan(72)
    expect(b?.y).toBeGreaterThan(690)
    expect((b?.y ?? 0) + (b?.height ?? 0)).toBeLessThan(712)
  })

  test("measures nothing by default", async () => {
    const pages = await readPageText(await anchoredPdf())
    expect(pages.every((p) => p.boxes.size === 0)).toBe(true)
  })

  test("feeds suggestFieldsFromAnchors end to end", async () => {
    const bytes = await anchoredPdf()
    const boxes: PageBox[] = Array.from({ length: 3 }, (_, i) => ({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
      rotation: i === 1 ? 90 : 0,
    }))
    const { suggestions, skipped } = suggestFieldsFromAnchors(
      await readPageText(bytes, { measure: anchorRanges }),
      boxes,
    )
    expect(skipped).toBe(0)
    expect(suggestions.map((s) => [s.page, s.type, s.roleHint, s.required])).toEqual([
      [1, "SIGNATURE", "s1", true],
      [1, "DATE_SIGNED", "s2", true],
      [2, "INITIALS", "buyer", false],
    ])
  })

  test("is safe to call concurrently", async () => {
    const bytes = await anchoredPdf()
    const results = await Promise.all([
      readPageText(bytes, { measure: anchorRanges }),
      readPageText(bytes, { measure: anchorRanges }),
    ])
    expect(results[0]).toEqual(results[1])
  })

  test("returns thin drawn paths as lines when asked", async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    page.drawLine({ start: { x: 72, y: 200 }, end: { x: 272, y: 200 }, thickness: 1 })
    page.drawRectangle({ x: 300, y: 300, width: 100, height: 50, color: rgb(0.9, 0.9, 0.9) })
    const bytes = await doc.save()
    const [p] = await readPageText(bytes, { lines: true })
    expect(p?.lines).toHaveLength(1)
    // PDFium's bounds include the stroke and are rounded outward
    expect(Math.abs((p?.lines?.[0]?.x ?? 0) - 72)).toBeLessThanOrEqual(2)
    expect(Math.abs((p?.lines?.[0]?.width ?? 0) - 200)).toBeLessThanOrEqual(3)
    const [plain] = await readPageText(bytes)
    expect(plain?.lines).toBeUndefined()
  })
})

describe("text rules on a real signature block", () => {
  test("drawn rules and underscores, two columns, roles from defined terms", async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const page = doc.addPage([612, 792])
    const text = (t: string, x: number, y: number, f = font) =>
      page.drawText(t, { x, y, size: 11, font: f })
    text(
      'This agreement is between Acme Ltd (the "Supplier") and Jane Doe (the "Client").',
      72,
      720,
    )
    text("The Client shall sign and date this agreement where indicated.", 72, 700)
    text("SUPPLIER", 72, 300, bold)
    text("CLIENT", 330, 300, bold)
    // Supplier: drawn rules with labels underneath
    page.drawLine({ start: { x: 72, y: 250 }, end: { x: 252, y: 250 }, thickness: 0.75 })
    text("Signature", 72, 238)
    page.drawLine({ start: { x: 72, y: 200 }, end: { x: 252, y: 200 }, thickness: 0.75 })
    text("Date", 72, 188)
    // Client: labels with underscores
    text("Signature: ____________________", 330, 250)
    text("Date: ____________", 330, 200)
    const bytes = await doc.save()

    const pages = await readPageText(bytes, { measure: createTextRuleScanner(), lines: true })
    const box: PageBox = { x: 0, y: 0, width: 612, height: 792, rotation: 0 }
    const { suggestions } = suggestFieldsFromText(pages, [box])
    expect(suggestions.map((s) => [s.type, s.roleHint, s.x < 0.5 ? "left" : "right"])).toEqual([
      ["SIGNATURE", "supplier", "left"],
      ["SIGNATURE", "client", "right"],
      ["DATE_SIGNED", "supplier", "left"],
      ["DATE_SIGNED", "client", "right"],
    ])
    // The supplier's signature sits on the drawn rule
    const sig = suggestions[0]
    expect(Math.abs(((sig?.y ?? 0) + (sig?.height ?? 0)) * 792 - (792 - 250))).toBeLessThanOrEqual(
      2,
    )
    expect(Math.abs((sig?.width ?? 0) * 612 - 180)).toBeLessThanOrEqual(3)
  })
})

describe("readPageText: styles (document import)", () => {
  /** The style of the first character of `word` on the page. */
  const styleOf = (
    page: Awaited<ReturnType<typeof readPageText>>[number] | undefined,
    word: string,
  ) => {
    const at = page?.text.indexOf(word) ?? -1
    const span = page?.spans?.find((s) => s.start <= at && at < s.end)
    return (
      span && { bold: span.bold, italic: span.italic, underline: span.underline, size: span.size }
    )
  }

  test("bold and italic from the font, size, and underline from a rule under the words", async () => {
    const doc = await PDFDocument.create()
    const regular = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const italic = await doc.embedFont(StandardFonts.HelveticaOblique)
    const page = doc.addPage([612, 792])
    page.drawText("Heading", { x: 72, y: 720, size: 18, font: bold })
    page.drawText("plain", { x: 72, y: 680, size: 11, font: regular })
    page.drawText("slanted", { x: 72, y: 660, size: 11, font: italic })
    const width = regular.widthOfTextAtSize("marked", 11)
    page.drawText("marked", { x: 72, y: 640, size: 11, font: regular })
    page.drawLine({ start: { x: 72, y: 638.5 }, end: { x: 72 + width, y: 638.5 }, thickness: 0.6 })
    // A table border just under a short word, much wider than it: not an underline.
    page.drawText("cell", { x: 72, y: 600, size: 11, font: regular })
    page.drawLine({ start: { x: 60, y: 598 }, end: { x: 400, y: 598 }, thickness: 0.5 })
    // A rule above the text (a signature line over its caption): not an underline either.
    page.drawLine({ start: { x: 72, y: 572 }, end: { x: 110, y: 572 }, thickness: 0.5 })
    page.drawText("caption", { x: 72, y: 560, size: 11, font: regular })
    const [p] = await readPageText(await doc.save(), { styles: true })

    expect(styleOf(p, "Heading")).toEqual({ bold: true, italic: false, underline: false, size: 18 })
    expect(styleOf(p, "plain")).toEqual({ bold: false, italic: false, underline: false, size: 11 })
    expect(styleOf(p, "slanted")).toMatchObject({ italic: true, bold: false })
    expect(styleOf(p, "marked")).toMatchObject({ underline: true })
    expect(styleOf(p, "cell")).toMatchObject({ underline: false })
    expect(styleOf(p, "caption")).toMatchObject({ underline: false })
    // Spans cover the text, in order, without gaps.
    const spans = p?.spans ?? []
    expect(spans[0]?.start).toBe(0)
    expect(spans.at(-1)?.end).toBe(p?.text.length)
    for (let i = 1; i < spans.length; i++) expect(spans[i]?.start).toBe(spans[i - 1]?.end)
  })

  test("styles only when asked", async () => {
    const [p] = await readPageText(await anchoredPdf())
    expect(p?.spans).toBeUndefined()
  })
})
