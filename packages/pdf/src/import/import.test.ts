import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { applyVariableUpdates, findStarter, ImportError, importContent } from "@sahihi/core"
import { strToU8, zipSync } from "fflate"
import { composeGeneratedDocument } from "../compose/document"
import { readForImport, sniffImportFormat } from "./import"

const DATE = new Date("2026-10-09T12:00:00.000Z")

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return "ok"
  } catch (err) {
    return err instanceof ImportError ? err.code : String(err)
  }
}

/** A minimal Word file: the body, plus styles and numbering when given. */
function docx(body: string, extra: { styles?: string; numbering?: string } = {}): Uint8Array {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${w}><w:body>${body}</w:body></w:document>`,
    ),
    ...(extra.styles
      ? { "word/styles.xml": strToU8(`<w:styles ${w}>${extra.styles}</w:styles>`) }
      : {}),
    ...(extra.numbering
      ? { "word/numbering.xml": strToU8(`<w:numbering ${w}>${extra.numbering}</w:numbering>`) }
      : {}),
  })
}

const styles = `<w:style w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>`
const numbering = `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="6"><w:abstractNumId w:val="2"/></w:num>`
const p = (text: string, props = "", runProps = "") =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`

describe("Word import", () => {
  test("headings, marks, lists, tables; tracked deletions and text boxes left out", async () => {
    const body = [
      p("Lease &amp; Licence", '<w:pStyle w:val="Title"/>'),
      p("1. Premises", '<w:pStyle w:val="Heading1"/>'),
      `<w:p><w:r><w:t xml:space="preserve">The tenant is </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Jane Doe</w:t></w:r><w:del><w:r><w:delText>OLD</w:delText></w:r></w:del><w:r><w:rPr><w:i w:val="0"/></w:rPr><w:t>.</w:t></w:r></w:p>`,
      p("Water", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr>'),
      p("Pay rent", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="6"/></w:numPr>'),
      `<w:tbl><w:tr><w:tc>${p("Rent")}</w:tc><w:tc>${p("KES 20,000")}${p("monthly")}</w:tc></w:tr></w:tbl>`,
      `<w:p><w:r><w:pict><w:txbxContent>${p("floating box")}</w:txbxContent></w:pict></w:r></w:p>`,
    ].join("")
    const { format, blocks } = await readForImport(docx(body, { styles, numbering }))
    expect(format).toBe("docx")
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Lease & Licence", numbered: false },
      { type: "heading", level: 1, text: "Premises", numbered: true },
      {
        type: "paragraph",
        runs: [{ text: "The tenant is " }, { text: "Jane Doe", marks: ["bold"] }, { text: "." }],
      },
      { type: "listItem", ordered: false, runs: [{ text: "Water" }] },
      { type: "listItem", ordered: true, runs: [{ text: "Pay rent" }] },
      {
        type: "table",
        rows: [[[{ text: "Rent" }], [{ text: "KES 20,000" }, { text: "\n" }, { text: "monthly" }]]],
      },
    ])
    const data = importContent(blocks, "lease.docx")
    expect(data.title).toBe("Lease & Licence")
    expect(data.content.content.map((s) => s.attrs.title)).toEqual(["Premises"])
  })

  test("a ZIP without a Word body, and other files, are refused by their bytes", async () => {
    expect(sniffImportFormat(zipSync({ "a.txt": strToU8("hi") }))).toBeNull()
    expect(await code(readForImport(strToU8("MZ\u0090 not a document")))).toBe("unsupported")
    expect(await code(readForImport(new Uint8Array(11 * 1024 * 1024)))).toBe("too_large")
  })
})

describe("PDF import", () => {
  test("a rendered starter comes back with its headings and words", async () => {
    const nda = findStarter("mutual-nda")?.build()
    if (!nda) throw new Error("missing starter")
    const filled = applyVariableUpdates(
      nda,
      nda.variables.map((v) => ({ key: v.key, value: "Acme Ltd" })),
      "answer",
    )
    const { bytes } = await composeGeneratedDocument(filled, { date: DATE })
    const { format, blocks } = await readForImport(bytes)
    expect(format).toBe("pdf")
    const data = importContent(blocks, "nda.pdf")
    const titles = data.content.content.map((s) => s.attrs.title)
    // Every numbered clause of the starter is a section again.
    for (const s of nda.content.content.filter((s) => s.attrs.numbered)) {
      expect(titles).toContain(s.attrs.title)
    }
    expect(JSON.stringify(data.content)).toContain("Acme Ltd")
    // The page footer ("Page 1 of 2") is gone.
    expect(JSON.stringify(data.content)).not.toMatch(/Page \d+ of \d+/)
  })

  test("a scan has no text", async () => {
    const scan = readFileSync(join(import.meta.dir, "../../../../fixtures/scanned.pdf"))
    expect(await code(readForImport(new Uint8Array(scan)))).toBe("no_text")
  })
})
