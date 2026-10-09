import { describe, expect, test } from "bun:test"
import {
  applyRoleContacts,
  applyVariableUpdates,
  findStarter,
  type GeneratedDocumentData,
  sha256Hex,
} from "@sahihi/core"
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
