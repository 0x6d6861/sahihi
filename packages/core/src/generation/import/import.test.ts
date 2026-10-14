import { describe, expect, test } from "bun:test"
import { generationPreflight } from "../preflight"
import { blankDocument } from "../starters/blank"
import { ImportError, type ImportedBlock, MAX_IMPORT_CHARS } from "./blocks"
import { importContent } from "./content"
import { type PdfTextSpan, pdfTextToBlocks } from "./pdf-text"

const page = (...lines: string[]) => lines.join("\r\n")

describe("pdfTextToBlocks", () => {
  test("finds headings, rejoins run-on lines and mends hyphenated words", () => {
    const blocks = pdfTextToBlocks([
      page(
        "SERVICES AGREEMENT",
        "1. Definitions",
        "In this Agreement the following words have the meanings given to them in this",
        "clause, unless the context requires otherwise and the parties agree in writ-",
        "ing to a different meaning.",
        "2. Payment",
        "The Client pays within 30 days.",
      ),
    ])
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "SERVICES AGREEMENT", numbered: false },
      { type: "heading", level: 1, text: "Definitions", numbered: true, label: "1." },
      {
        type: "paragraph",
        runs: [
          {
            text: "In this Agreement the following words have the meanings given to them in this clause, unless the context requires otherwise and the parties agree in writing to a different meaning.",
          },
        ],
      },
      { type: "heading", level: 1, text: "Payment", numbered: true, label: "2." },
      { type: "paragraph", runs: [{ text: "The Client pays within 30 days." }] },
    ])
  })

  test("keeps sub-clauses and sentences as paragraphs, list markers as list items", () => {
    const blocks = pdfTextToBlocks([
      page(
        "2.1 The Supplier delivers the goods.",
        "1. The Client shall pay every invoice on time.",
        "(a) on the due date;",
        "• in Kenya shillings",
      ),
    ])
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "paragraph", "listItem", "listItem"])
    expect(blocks[2]).toEqual({
      type: "listItem",
      ordered: true,
      runs: [{ text: "on the due date;" }],
      label: "(a)",
    })
    expect(blocks[3]).toEqual({
      type: "listItem",
      ordered: false,
      runs: [{ text: "in Kenya shillings" }],
    })
  })

  test("drops repeated headers and footers, page numbers and fill-in lines", () => {
    const body = (n: number) =>
      page("Acme Ltd — Confidential", `Clause ${n} text ends here.`, `Page ${n} of 3`)
    const blocks = pdfTextToBlocks([
      body(1),
      body(2),
      page("Acme Ltd — Confidential", "Signature: ____________", "Date: ..........", "Page 3 of 3"),
    ])
    expect(blocks).toEqual([
      { type: "paragraph", runs: [{ text: "Clause 1 text ends here." }] },
      { type: "paragraph", runs: [{ text: "Clause 2 text ends here." }] },
    ])
  })
})

test("pdfTextToBlocks: a title-like first line is the title; bare signing labels go", () => {
  const blocks = pdfTextToBlocks([page("Offer of Employment", "Dear Jane,", "Signature", "Date")])
  expect(blocks).toEqual([
    { type: "heading", level: 1, text: "Offer of Employment", numbered: false },
    { type: "paragraph", runs: [{ text: "Dear Jane," }] },
  ])
})

describe("importContent", () => {
  const blocks: ImportedBlock[] = [
    { type: "heading", level: 1, text: "Consulting Agreement", numbered: false },
    {
      type: "paragraph",
      runs: [{ text: "Between Acme Ltd and " }, { text: "Jane", marks: ["bold"] }],
    },
    { type: "heading", level: 1, text: "Services", numbered: true },
    { type: "listItem", ordered: false, runs: [{ text: "Advice" }] },
    { type: "listItem", ordered: false, runs: [{ text: "Reports" }] },
    {
      type: "table",
      rows: [[[{ text: "Fee" }], [{ text: "KES 5,000" }]], [[{ text: "Term" }]]],
    },
  ]

  test("title from the first heading, an introduction, sections, lists and a padded table", () => {
    const data = importContent(blocks, "fallback.pdf")
    expect(data.title).toBe("Consulting Agreement")
    const [intro, services] = data.content.content
    expect(intro?.attrs).toEqual({ id: "s1", title: "Introduction", numbered: false })
    expect(intro?.content[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "Between Acme Ltd and " },
        { type: "text", text: "Jane", marks: [{ type: "bold" }] },
      ],
    })
    expect(services?.attrs.numbered).toBe(true)
    expect(services?.content[0]).toMatchObject({ type: "bulletList", content: [{}, {}] })
    const table = services?.content[1]
    expect(table?.type).toBe("table")
    if (table?.type === "table") expect(table.content.map((r) => r.content.length)).toEqual([2, 2])
    expect(data.variables).toEqual([])
    expect(data.roles.map((r) => r.key)).toEqual(["signer_1"])
  })

  test("falls back to the file name when there's no leading heading", () => {
    const data = importContent([{ type: "paragraph", runs: [{ text: "Hello." }] }], "My_lease.docx")
    expect(data.title).toBe("My lease")
  })

  test("refuses empty and over-long documents", () => {
    expect(() => importContent([], "x.pdf")).toThrow(ImportError)
    const long = "x".repeat(MAX_IMPORT_CHARS + 1)
    try {
      importContent([{ type: "paragraph", runs: [{ text: long }] }], "x.pdf")
      throw new Error("expected a refusal")
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError)
      expect((err as ImportError).code).toBe("too_large")
    }
  })
})

describe("blankDocument", () => {
  test("is valid, with one signer whose only open problems are contacts", () => {
    const issues = generationPreflight(blankDocument()).map((i) => i.code)
    expect(issues.sort()).toEqual(["invalid_email", "missing_name"])
  })
})

describe("importContent: the source's numbers (Word)", () => {
  const text = (t: string) => [{ text: t }]

  test("a heading keeps its number when its section's would differ", () => {
    const data = importContent(
      [
        { type: "heading", level: 1, text: "Definitions", numbered: true, label: "1." },
        { type: "paragraph", runs: text("Words mean things.") },
        { type: "heading", level: 2, text: "Scope", numbered: true, label: "1.1" },
        { type: "paragraph", runs: text("This applies.") },
        { type: "heading", level: 1, text: "Payment", numbered: true, label: "2." },
        { type: "heading", level: 1, text: "Notices", numbered: true, label: "Article 3" },
      ],
      "terms.docx",
    )
    // The first heading is numbered, so it isn't taken for the title.
    expect(data.title).toBe("Terms")
    expect(data.content.content.map((s) => [s.attrs.title, s.attrs.numbered])).toEqual([
      ["Definitions", true],
      ["1.1 Scope", false],
      ["Payment", true],
      ["Article 3 Notices", false],
    ])
  })

  test("numbered items stay a list only where the renderer prints the same number", () => {
    const data = importContent(
      [
        { type: "heading", level: 1, text: "Terms", numbered: false },
        { type: "heading", level: 1, text: "Fees", numbered: false },
        { type: "listItem", ordered: true, runs: text("first"), label: "(a)" },
        { type: "listItem", ordered: true, runs: text("second"), label: "(b)" },
        { type: "listItem", ordered: true, runs: text("one"), label: "1." },
        { type: "listItem", ordered: true, runs: text("plain") },
        { type: "listItem", ordered: false, runs: text("dot"), label: "•" },
      ],
      "x",
    )
    const [fees] = data.content.content
    expect(fees?.content).toEqual([
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "second" }] }],
          },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "1. one" }] },
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "plain" }] }],
          },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "dot" }] }],
          },
        ],
      },
    ])
  })

  test("header rows become header cells", () => {
    const data = importContent(
      [
        { type: "heading", level: 1, text: "Fees", numbered: false },
        {
          type: "table",
          rows: [
            [text("Item"), text("Price")],
            [text("Rent"), text("100")],
          ],
          headerRows: 1,
        },
      ],
      "x",
    )
    const table = data.content.content[0]?.content[0]
    if (table?.type !== "table") throw new Error("expected a table")
    expect(table.content.map((r) => r.content.map((c) => c.type))).toEqual([
      ["tableHeader", "tableHeader"],
      ["tableCell", "tableCell"],
    ])
  })
})

describe("pdfTextToBlocks: styles from the PDF", () => {
  /** A page from styled pieces: [text, style] in order, lines split by "\n" inside the text. */
  const styled = (...parts: [string, Omit<PdfTextSpan, "start" | "end">?][]) => {
    let text = ""
    const spans: PdfTextSpan[] = []
    for (const [part, style = {}] of parts) {
      spans.push({ start: text.length, end: text.length + part.length, size: 10, ...style })
      text += part
    }
    return { text, spans }
  }

  test("bold, italic and underline stay on their words, across a joined line", () => {
    const blocks = pdfTextToBlocks([
      styled(
        ["The Tenant, "],
        ["Jane Doe", { bold: true }],
        [", pays the rent to "],
        ["the Landlord", { italic: true }],
        [" by the "],
        ["first", { underline: true }],
        [" "],
        ["day", { underline: true }],
        ["\r\n"],
        ["of each month.", {}],
      ),
    ])
    expect(blocks).toEqual([
      {
        type: "paragraph",
        runs: [
          { text: "The Tenant, " },
          { text: "Jane Doe", marks: ["bold"] },
          { text: ", pays the rent to " },
          { text: "the Landlord", marks: ["italic"] },
          { text: " by the " },
          { text: "first day", marks: ["underline"] },
          { text: " of each month." },
        ],
      },
    ])
  })

  test("larger and bold lines are headings, keeping their number; the largest first line is the title", () => {
    const blocks = pdfTextToBlocks([
      styled(
        ["Tenancy Agreement", { size: 18 }],
        ["\r\n"],
        ["Rent", { size: 13 }],
        ["\r\nThe rent is due monthly.\r\n"],
        ["2.1 Deposit", { bold: true }],
        ["\r\nA deposit is paid.\r\n"],
        ["Payable by", { bold: true }],
        ["\r\nthe tenant on signing.\r\n"],
        ["• ", {}],
        ["Water", { bold: true }],
      ),
    ])
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Tenancy Agreement", numbered: false },
      { type: "heading", level: 1, text: "Rent", numbered: false },
      { type: "paragraph", runs: [{ text: "The rent is due monthly." }] },
      { type: "heading", level: 1, text: "Deposit", numbered: true, label: "2.1" },
      { type: "paragraph", runs: [{ text: "A deposit is paid." }] },
      // The next line carries on in lower case: a bold phrase, not a heading.
      {
        type: "paragraph",
        runs: [{ text: "Payable by", marks: ["bold"] }, { text: " the tenant on signing." }],
      },
      { type: "listItem", ordered: false, runs: [{ text: "Water", marks: ["bold"] }] },
    ])
  })

  test("where all the text is bold, bold says nothing about headings", () => {
    const blocks = pdfTextToBlocks([
      styled(["Payment terms\r\nThe rent is due monthly.\r\nLate fees apply.", { bold: true }]),
    ])
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph"])
    // Only the first line, as the title (by its words, like an unstyled PDF).
    expect(blocks[0]).toMatchObject({ text: "Payment terms" })
  })

  test("bullets drawn from Symbol or Wingdings are bullets", () => {
    expect(pdfTextToBlocks([" Deliver on time.\r\nKeep records."])).toEqual([
      { type: "listItem", ordered: false, runs: [{ text: "Deliver on time." }] },
      { type: "listItem", ordered: false, runs: [{ text: "Keep records." }] },
    ])
  })
})
