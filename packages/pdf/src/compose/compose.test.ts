import { describe, expect, test } from "bun:test"
import {
  applyRoleContacts,
  applyVariableUpdates,
  findStarter,
  type GeneratedDocumentData,
  sha256Hex,
} from "@sahihi/core"
import { PDFDict, PDFDocument, PDFName } from "pdf-lib"
import { inspectPdf } from "../parse/inspect"
import { readPageText } from "../parse/page-text"
import { ComposeError, composeGeneratedDocument, FIELD_SIZES } from "./document"

const DATE = new Date("2026-10-09T12:00:00.000Z")

function nda(): GeneratedDocumentData {
  const data = findStarter("mutual-nda")?.build()
  if (!data) throw new Error("missing starter")
  return data
}

function filled(): GeneratedDocumentData {
  const data = nda()
  return applyRoleContacts(
    applyVariableUpdates(
      data,
      data.variables.map((v) => ({ key: v.key, value: `${v.label} value` })),
      "answer",
    ),
    [
      { key: "party_a", name: "Amina Otieno", email: "amina@example.com" },
      { key: "party_b", name: "Brian Mwangi", email: "brian@example.org" },
    ],
  )
}

describe("composeGeneratedDocument", () => {
  test("is deterministic: the same version gives the same bytes", async () => {
    const a = await composeGeneratedDocument(filled(), { date: DATE })
    const b = await composeGeneratedDocument(filled(), { date: DATE })
    expect(await sha256Hex(a.bytes)).toBe(await sha256Hex(b.bytes))
    expect(a.fields).toEqual(b.fields)
  })

  test("reports page boxes that match the PDF itself", async () => {
    const out = await composeGeneratedDocument(filled(), { date: DATE })
    const info = await inspectPdf(out.bytes)
    expect(info.pageCount).toBe(out.pages.length)
    for (const [i, p] of info.pages.entries()) {
      expect(p.width).toBeCloseTo(out.pages[i]?.width ?? 0, 2)
      expect(p.height).toBeCloseTo(out.pages[i]?.height ?? 0, 2)
      expect(p.rotation).toBe(0)
    }
  })

  test("places every field once, inside its page, at its fixed size", async () => {
    const out = await composeGeneratedDocument(filled(), { date: DATE })
    expect(out.fields.map((f) => f.id)).toEqual([
      "party_a_signature",
      "party_a_name",
      "party_a_date",
      "party_b_signature",
      "party_b_name",
      "party_b_date",
    ])
    for (const f of out.fields) {
      const page = out.pages[f.page - 1]
      if (!page) throw new Error(`field ${f.id} on missing page ${f.page}`)
      expect(f.rect.width).toBe(FIELD_SIZES[f.fieldType].width)
      expect(f.rect.height).toBe(FIELD_SIZES[f.fieldType].height)
      expect(f.rect.x).toBeGreaterThanOrEqual(0)
      expect(f.rect.y).toBeGreaterThanOrEqual(0)
      expect(f.rect.x + f.rect.width).toBeLessThanOrEqual(page.width)
      expect(f.rect.y + f.rect.height).toBeLessThanOrEqual(page.height)
    }
    // A block's fields stack downwards on one page, without overlapping.
    for (const role of ["party_a", "party_b"]) {
      const fs = out.fields.filter((f) => f.roleKey === role)
      expect(new Set(fs.map((f) => f.page)).size).toBe(1)
      for (let i = 1; i < fs.length; i++) {
        const above = fs[i - 1]?.rect
        const below = fs[i]?.rect
        if (above && below) expect(below.y + below.height).toBeLessThan(above.y)
      }
    }
  })

  test("field coordinates are stable (snapshot)", async () => {
    const out = await composeGeneratedDocument(filled(), { date: DATE })
    const round = (n: number) => Math.round(n * 100) / 100
    expect(
      out.fields.map((f) => ({
        id: f.id,
        page: f.page,
        x: round(f.rect.x),
        y: round(f.rect.y),
        width: f.rect.width,
        height: f.rect.height,
      })),
    ).toMatchSnapshot()
  })

  test("each field's signing line and label are drawn where the layout says", async () => {
    const out = await composeGeneratedDocument(filled(), { date: DATE })
    const labels = ["Signature", "Name", "Date"]
    const pages = await readPageText(out.bytes, {
      lines: true,
      measure: (text) => {
        const ranges: [number, number][] = []
        for (const label of labels) {
          for (let i = text.indexOf(label); i >= 0; i = text.indexOf(label, i + 1)) {
            ranges.push([i, i + label.length])
          }
        }
        return ranges
      },
    })
    for (const f of out.fields) {
      const page = pages[f.page - 1]
      if (!page) throw new Error(`no text for page ${f.page}`)
      // The rule along the bottom edge of the box (PDFium pads it by half the stroke width).
      const rule = page.lines?.find(
        (l) =>
          Math.abs(l.x - f.rect.x) < 1 &&
          Math.abs(l.y - f.rect.y) < 1.5 &&
          Math.abs(l.width - f.rect.width) < 2,
      )
      expect(rule).toBeDefined()
      // Its label sits just under the rule, outside the box, so a stamp can't cover it.
      const label = f.label ?? ""
      const starts = [...page.text.matchAll(new RegExp(label, "g"))].map((m) => m.index ?? -1)
      const under = starts.some((s) => {
        const box = page.boxes.get(s)
        return (
          box !== undefined &&
          Math.abs(box.x - f.rect.x) < 2 &&
          box.y + box.height <= f.rect.y &&
          f.rect.y - (box.y + box.height) < 12
        )
      })
      expect(under).toBe(true)
    }
  })

  test("refuses unresolved blanks unless previewing", async () => {
    await expect(composeGeneratedDocument(nda(), { date: DATE })).rejects.toBeInstanceOf(
      ComposeError,
    )
    const preview = await composeGeneratedDocument(nda(), { date: DATE, allowUnresolved: true })
    const [first] = await readPageText(preview.bytes)
    expect(first?.text).toContain("[Effective date]")
  })

  test("long unbroken values wrap instead of running off the page", async () => {
    const data = applyVariableUpdates(
      filled(),
      [{ key: "purpose", value: "x".repeat(400) }],
      "edit",
    )
    const out = await composeGeneratedDocument(data, { date: DATE })
    const pages = await readPageText(out.bytes, {
      measure: (text) => {
        const i = text.indexOf("xxxx")
        return i < 0 ? [] : [[i, text.lastIndexOf("x") + 1]]
      },
    })
    const boxes = pages.flatMap((p) => [...p.boxes.values()])
    expect(boxes.length).toBeGreaterThan(0)
    for (const b of boxes) expect(b.x + b.width).toBeLessThanOrEqual(595.28 - 72 + 0.5)
  })
})

/** The /BaseFont names of every font in a PDF. */
async function baseFonts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes)
  const names: string[] = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of("Type")) !== PDFName.of("Font")) continue
    const base = obj.get(PDFName.of("BaseFont"))
    if (base instanceof PDFName) names.push(base.decodeText())
  }
  return names
}

describe("italics and tables", () => {
  const cell = (text: string, type: "tableCell" | "tableHeader" = "tableCell") => ({
    type,
    attrs: { colspan: 1 as const, rowspan: 1 as const, colwidth: null },
    content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
  })

  /** The filled NDA with blocks appended to its Purpose section. */
  function withBlocks(blocks: GeneratedDocumentData["content"]["content"][number]["content"]) {
    const data = filled()
    const purpose = data.content.content.find((s) => s.attrs.id === "purpose")
    purpose?.content.push(...blocks)
    return data
  }

  test("italic text uses the italic face", async () => {
    const data = withBlocks([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Emphasis", marks: [{ type: "italic" }] },
          { type: "text", text: " and both", marks: [{ type: "italic" }, { type: "bold" }] },
        ],
      },
    ])
    const out = await composeGeneratedDocument(data, { date: DATE })
    const faces = await baseFonts(out.bytes)
    expect(faces.some((f) => f.startsWith("NotoSans-Italic-"))).toBe(true)
    expect(faces.some((f) => f.startsWith("NotoSans-BoldItalic-"))).toBe(true)
  })

  test("table cells hold their text inside equal columns", async () => {
    const data = withBlocks([
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("Item", "tableHeader"), cell("Amount", "tableHeader")],
          },
          {
            type: "tableRow",
            content: [cell("Consulting fees for the pilot"), cell("KES 100,000")],
          },
        ],
      },
    ])
    const out = await composeGeneratedDocument(data, { date: DATE })
    const pages = await readPageText(out.bytes, {
      measure: (text) => {
        const ranges: [number, number][] = []
        for (const t of ["Consulting", "KES"]) {
          const i = text.indexOf(t)
          if (i >= 0) ranges.push([i, i + t.length])
        }
        return ranges
      },
    })
    const page = pages.find((p) => p.text.includes("Consulting"))
    const at = (t: string) => page?.boxes.get(page.text.indexOf(t))
    const consulting = at("Consulting")
    const kes = at("KES")
    const half = 72 + (595.28 - 144) / 2
    expect(consulting?.x).toBeGreaterThan(72)
    expect(consulting?.x).toBeLessThan(half)
    expect(kes?.x).toBeGreaterThan(half)
    expect(await sha256Hex(out.bytes)).toBe(
      await sha256Hex((await composeGeneratedDocument(data, { date: DATE })).bytes),
    )
  })

  test("rows move to the next page whole", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      type: "tableRow" as const,
      content: [cell(`Row ${i} first line`), cell(`Row ${i} value`)],
    }))
    const out = await composeGeneratedDocument(withBlocks([{ type: "table", content: rows }]), {
      date: DATE,
    })
    const pages = await readPageText(out.bytes)
    for (let i = 0; i < 80; i++) {
      const holders = pages.filter((p) => p.text.includes(`Row ${i} first`))
      const values = pages.filter((p) => p.text.includes(`Row ${i} value`))
      expect(holders.map((p) => p.page)).toEqual(values.map((p) => p.page))
    }
  })
})
