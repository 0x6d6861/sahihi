import { describe, expect, test } from "bun:test"
import { generationPreflight } from "../preflight"
import { blankDocument } from "../starters/blank"
import { ImportError, type ImportedBlock, MAX_IMPORT_CHARS } from "./blocks"
import { importContent } from "./content"
import { pdfTextToBlocks } from "./pdf-text"

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
      { type: "heading", level: 1, text: "Definitions", numbered: true },
      {
        type: "paragraph",
        runs: [
          {
            text: "In this Agreement the following words have the meanings given to them in this clause, unless the context requires otherwise and the parties agree in writing to a different meaning.",
          },
        ],
      },
      { type: "heading", level: 1, text: "Payment", numbered: true },
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
