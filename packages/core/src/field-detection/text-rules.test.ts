import { describe, expect, test } from "bun:test"
import type { PageBox, PdfRect } from "../geometry/coordinates"
import type { PageText } from "./anchor-tags"
import { createTextRuleScanner, definedTerms, suggestFieldsFromText } from "./text-rules"

const LETTER: PageBox = { x: 0, y: 0, width: 612, height: 792, rotation: 0 }
const close = (a: number | undefined, b: number) => expect(a ?? Number.NaN).toBeCloseTo(b, 6)

/**
 * A page laid out row by row: each glyph 6 pt wide and 10 pt tall from its row's baseline,
 * spaces unboxed, rows joined with the "\r\n" PDFium generates (also unboxed).
 */
function page(rows: { text: string; x?: number; y: number }[], extra: Partial<PageText> = {}) {
  let text = ""
  const boxes = new Map<number, PdfRect>()
  rows.forEach((row, r) => {
    if (r > 0) text += "\r\n"
    ;[...row.text].forEach((ch, i) => {
      if (ch !== " ")
        boxes.set(text.length + i, { x: (row.x ?? 72) + i * 6, y: row.y, width: 6, height: 10 })
    })
    text += row.text
  })
  return { page: 1, text, boxes, ...extra } satisfies PageText
}

const run = (...pages: PageText[]) =>
  suggestFieldsFromText(
    pages,
    pages.map(() => LETTER),
  ).suggestions

describe("suggestFieldsFromText", () => {
  test("a label with underscores to its right: the field sits on the line", () => {
    const [s, ...rest] = run(page([{ text: "Signature: ____________", y: 100 }]))
    expect(rest).toHaveLength(0)
    expect(s).toMatchObject({ type: "SIGNATURE", page: 1, source: "text", sourceName: "Signature" })
    close(s?.x, (72 + 11 * 6) / 612)
    close(s?.width, (12 * 6) / 612)
    close(s?.height, 36 / 792)
    close((s?.y ?? 0) + (s?.height ?? 0), 1 - 100 / 792) // bottom on the baseline
  })

  test("the label nearest the line decides the type", () => {
    const [s] = run(page([{ text: "Signature Date: ________", y: 100 }]))
    expect(s?.type).toBe("DATE_SIGNED")
    expect(s?.height).toBeCloseTo(18 / 792, 6)
  })

  test("a line above its label", () => {
    const s = run(
      page([
        { text: "________________", y: 120 },
        { text: "Authorised Signature", y: 104 },
      ]),
    )
    expect(s.map((x) => x.type)).toEqual(["SIGNATURE"])
  })

  test("a drawn rule above a label", () => {
    const rule: PdfRect = { x: 72, y: 119.5, width: 180, height: 1 }
    const [s] = run(page([{ text: "Printed Name", y: 104 }], { lines: [rule] }))
    expect(s?.type).toBe("NAME")
    close(s?.width, 180 / 612)
  })

  test("drawn paths that are too thick or too short aren't lines", () => {
    const box: PdfRect = { x: 72, y: 115, width: 180, height: 10 }
    const tick: PdfRect = { x: 72, y: 119.5, width: 20, height: 1 }
    expect(run(page([{ text: "Signature", y: 104 }], { lines: [box, tick] }))).toEqual([])
  })

  test("'Date:' ending its row gets a field right after the label", () => {
    const [s] = run(page([{ text: "Date:", y: 100 }]))
    expect(s?.type).toBe("DATE_SIGNED")
    close(s?.x, (72 + 4 * 6 + 4) / 612)
  })

  test("labels in running text without a line are ignored", () => {
    expect(
      run(
        page([
          { text: "The effective date is the date signed by both parties.", y: 400 },
          { text: "Each party shall sign and print its name here.", y: 380 },
        ]),
      ),
    ).toEqual([])
  })

  test("label words in long rows of running text aren't labels, even next to a line", () => {
    const row = "The Tenant shall pay the rent on or before the due date in each and every month."
    const rule: PdfRect = { x: 72, y: 119.5, width: 400, height: 1 }
    expect(run(page([{ text: row, y: 104 }], { lines: [rule] }))).toEqual([])
  })

  test("two columns: each field belongs to the party heading its column", () => {
    const s = run(
      page([
        { text: "LANDLORD                                TENANT", y: 160 },
        { text: "Signature: __________                   Signature: __________", y: 120 },
        { text: "Date: ________                          Date: ________", y: 100 },
      ]),
    )
    expect(s.map((x) => [x.type, x.roleHint])).toEqual([
      ["SIGNATURE", "landlord"],
      ["SIGNATURE", "tenant"],
      ["DATE_SIGNED", "landlord"],
      ["DATE_SIGNED", "tenant"],
    ])
  })

  test("a party word on the label's row wins, and defined terms count as parties", () => {
    const p1 = { ...page([{ text: 'Acme Ltd (the "Supplier") and Bob ("Client").', y: 700 }]) }
    const p2 = {
      ...page([
        { text: "Supplier", y: 300 },
        { text: "By: ____________     Client signature: ____________", y: 260 },
      ]),
      page: 2,
    }
    const s = run(p1, p2)
    expect(s.map((x) => [x.page, x.type, x.roleHint])).toEqual([
      [2, "SIGNATURE", "supplier"],
      [2, "SIGNATURE", "client"],
    ])
  })

  test("lowercase party words are body text, not headings", () => {
    const [s] = run(
      page([
        { text: "the tenant shall pay", y: 160 },
        { text: "Signature: __________", y: 120 },
      ]),
    )
    expect(s?.roleHint).toBeNull()
  })
})

describe("definedTerms", () => {
  test("quoted terms in parentheses", () => {
    expect(
      definedTerms(
        'Jane ("Landlord"), Acme (the “Company”), Bob (hereinafter referred to as the "Tenant") (see "x")',
      ),
    ).toEqual(["landlord", "company", "tenant"])
  })
})

describe("createTextRuleScanner", () => {
  test("pages that can't hold a signature line measure nothing", () => {
    const scan = createTextRuleScanner()
    const body = "The Tenant shall pay the Landlord by the due Date."
    expect(scan(body)).toEqual([])
    const rule = { x: 72, y: 100, width: 200, height: 1 }
    expect(scan(body, [rule]).length).toBeGreaterThan(0)
    expect(scan("Date:\r\nnext row").length).toBeGreaterThan(0)
  })

  test("asks for labels, blanks and party words, remembering terms from earlier pages", () => {
    const scan = createTextRuleScanner()
    scan('Bob (the "Licensor")')
    const text = "Licensor  Date: ____"
    const ranges = scan(text).map(([a, b]) => text.slice(a, b))
    expect(ranges.sort()).toEqual(["Date", "Licensor", "____"].sort())
  })
})
