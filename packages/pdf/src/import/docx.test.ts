import { describe, expect, test } from "bun:test"
import { importContent } from "@sahihi/core"
import { readDocxBlocks } from "./docx"
import { docx } from "./docx-fixture"
import { formatNumber } from "./docx-numbering"

const p = (text: string, props = "", runProps = "") =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const style = (id: string) => `<w:pStyle w:val="${id}"/>`
const num = (numId: number, ilvl = 0) =>
  `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`
const lvl = (ilvl: number, format: string, text: string, extra = "") =>
  `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/>${extra}</w:lvl>`

describe("readDocxBlocks: emphasis from styles", () => {
  const styles = [
    `<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>`,
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`,
    `<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/><w:rPr><w:b/></w:rPr></w:style>`,
    `<w:style w:type="character" w:styleId="Emphasis"><w:name w:val="Emphasis"/><w:rPr><w:i/></w:rPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="Term"><w:name w:val="Defined term"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:u w:val="single"/></w:rPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="TermChild"><w:name w:val="Term child"/><w:basedOn w:val="Term"/></w:style>`,
    `<w:style w:type="character" w:styleId="Hidden"><w:name w:val="Hidden"/><w:rPr><w:vanish/></w:rPr></w:style>`,
  ].join("")

  test("character styles, paragraph styles and their bases give bold, italic and underline", () => {
    const body = [
      `<w:p><w:r><w:t xml:space="preserve">Between </w:t></w:r><w:r><w:rPr><w:rStyle w:val="Strong"/></w:rPr><w:t>Acme</w:t></w:r><w:r><w:t xml:space="preserve"> and </w:t></w:r><w:r><w:rPr><w:rStyle w:val="Emphasis"/></w:rPr><w:t>you</w:t></w:r></w:p>`,
      p("Inherited.", style("TermChild")),
      // The run turns bold off; a character style that repeats the paragraph's bold cancels it.
      p("Not bold.", style("Term"), '<w:b w:val="0"/>'),
      `<w:p><w:pPr>${style("Term")}</w:pPr><w:r><w:rPr><w:rStyle w:val="Strong"/></w:rPr><w:t>Toggled.</w:t></w:r></w:p>`,
    ].join("")
    expect(readDocxBlocks(docx(body, { styles }))).toEqual([
      {
        type: "paragraph",
        runs: [
          { text: "Between " },
          { text: "Acme", marks: ["bold"] },
          { text: " and " },
          { text: "you", marks: ["italic"] },
        ],
      },
      { type: "paragraph", runs: [{ text: "Inherited.", marks: ["bold", "underline"] }] },
      { type: "paragraph", runs: [{ text: "Not bold.", marks: ["underline"] }] },
      { type: "paragraph", runs: [{ text: "Toggled.", marks: ["underline"] }] },
    ])
  })

  test("capitals come in as capitals; hidden text and the paragraph mark's formatting don't count", () => {
    const body = [
      `<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:caps/></w:rPr><w:t>schedule</w:t></w:r><w:r><w:rPr><w:rStyle w:val="Hidden"/></w:rPr><w:t>secret</w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>note</w:t></w:r><w:r><w:t xml:space="preserve"> one</w:t></w:r></w:p>`,
      p("x"),
    ].join("")
    expect(readDocxBlocks(docx(body, { styles }))[0]).toEqual({
      type: "paragraph",
      runs: [{ text: "SCHEDULE" }, { text: " one" }],
    })
  })

  test("formatting from a tracked change's old version is ignored", () => {
    const body = `<w:p><w:r><w:rPr><w:rPrChange><w:rPr><w:b/></w:rPr></w:rPrChange></w:rPr><w:t>now plain</w:t></w:r></w:p>`
    expect(readDocxBlocks(docx(body))).toEqual([
      { type: "paragraph", runs: [{ text: "now plain" }] },
    ])
  })
})

describe("readDocxBlocks: Word's numbering", () => {
  // A legal outline linked to the heading styles: 1. / 1.1 / (a), and a separate bullet list.
  const numbering = [
    `<w:abstractNum w:abstractNumId="0">`,
    lvl(0, "decimal", "%1.", `<w:pStyle w:val="Heading1"/>`),
    lvl(1, "decimal", "%1.%2", `<w:pStyle w:val="Heading2"/>`),
    lvl(2, "lowerLetter", "(%3)"),
    `</w:abstractNum>`,
    `<w:abstractNum w:abstractNumId="1">${lvl(0, "bullet", "")}</w:abstractNum>`,
    `<w:abstractNum w:abstractNumId="2">${lvl(0, "lowerRoman", "%1)")}</w:abstractNum>`,
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`,
    `<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>`,
    `<w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>`,
    // Same definition as 3, restarted at 1.
    `<w:num w:numId="4"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`,
    // Same definition as 3, continuing its count.
    `<w:num w:numId="5"><w:abstractNumId w:val="2"/></w:num>`,
  ].join("")
  const styles = [
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr>${num(1)}<w:outlineLvl w:val="0"/></w:pPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr>${num(2)}</w:pPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="ClauseHeading"><w:name w:val="Clause heading"/><w:basedOn w:val="Heading1"/></w:style>`,
  ].join("")

  test("numbered headings and items carry the number Word prints", () => {
    const body = [
      p("Definitions", style("Heading1")),
      p("Scope", style("Heading2")),
      p("first", num(1, 2)),
      p("second", num(1, 2)),
      p("Payment", style("ClauseHeading")),
      p("Scope again", style("Heading2")),
      p("bread", style("ListBullet")),
      p("i", num(3)),
      p("ii", num(3)),
      p("restarted", num(4)),
      p("continued", num(5)),
    ].join("")
    expect(readDocxBlocks(docx(body, { styles, numbering }))).toEqual([
      { type: "heading", level: 1, text: "Definitions", numbered: true, label: "1." },
      { type: "heading", level: 2, text: "Scope", numbered: true, label: "1.1" },
      { type: "listItem", ordered: true, runs: [{ text: "first" }], label: "(a)" },
      { type: "listItem", ordered: true, runs: [{ text: "second" }], label: "(b)" },
      { type: "heading", level: 1, text: "Payment", numbered: true, label: "2." },
      { type: "heading", level: 2, text: "Scope again", numbered: true, label: "2.1" },
      { type: "listItem", ordered: false, runs: [{ text: "bread" }] },
      { type: "listItem", ordered: true, runs: [{ text: "i" }], label: "i)" },
      { type: "listItem", ordered: true, runs: [{ text: "ii" }], label: "ii)" },
      { type: "listItem", ordered: true, runs: [{ text: "restarted" }], label: "i)" },
      { type: "listItem", ordered: true, runs: [{ text: "continued" }], label: "iii)" },
    ])
  })

  test("in a drafted document, clause numbers and cross-references stay right", () => {
    const body = [
      p("Services Agreement", style("Title")),
      p("Definitions", style("Heading1")),
      p("Scope", style("Heading2")),
      p("first", num(1, 2)),
      p("second", num(1, 2)),
      p("Payment", style("Heading1")),
    ].join("")
    const titled = `${styles}<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>`
    const data = importContent(readDocxBlocks(docx(body, { styles: titled, numbering })), "x")
    expect(data.title).toBe("Services Agreement")
    expect(data.content.content.map((s) => [s.attrs.title, s.attrs.numbered])).toEqual([
      ["Definitions", true],
      ["1.1 Scope", false],
      ["Payment", true],
    ])
    expect(data.content.content[1]?.content[0]?.type).toBe("orderedList")
  })

  test("a list switched off on the paragraph, and a missing list, are plain paragraphs", () => {
    const body = [p("plain", `${style("ListBullet")}${num(0)}`), p("ghost", num(99))].join("")
    expect(readDocxBlocks(docx(body, { styles, numbering }))).toEqual([
      { type: "paragraph", runs: [{ text: "plain" }] },
      { type: "paragraph", runs: [{ text: "ghost" }] },
    ])
  })

  test("number formats", () => {
    expect(formatNumber(3, "decimal")).toBe("3")
    expect(formatNumber(4, "decimalZero")).toBe("04")
    expect(formatNumber(28, "lowerLetter")).toBe("bb")
    expect(formatNumber(2, "upperLetter")).toBe("B")
    expect(formatNumber(14, "lowerRoman")).toBe("xiv")
    expect(formatNumber(1999, "upperRoman")).toBe("MCMXCIX")
    expect(formatNumber(12, "ordinal")).toBe("12th")
    expect(formatNumber(22, "ordinal")).toBe("22nd")
    expect(formatNumber(7, "chineseCounting")).toBe("7")
  })
})

describe("readDocxBlocks: tables and lines", () => {
  const cell = (text: string, props = "") =>
    `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}${p(text)}</w:tc>`

  test("merged cells keep their columns; header rows are marked", () => {
    const body = `<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("Item")}${cell("Qty")}${cell("Price")}</w:tr><w:tr>${cell("Rent and service", '<w:gridSpan w:val="2"/>')}${cell("100")}</w:tr><w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>${cell("2")}${cell("50")}</w:tr></w:tbl>`
    expect(readDocxBlocks(docx(body))).toEqual([
      {
        type: "table",
        headerRows: 1,
        rows: [
          [[{ text: "Item" }], [{ text: "Qty" }], [{ text: "Price" }]],
          [[{ text: "Rent and service" }], [], [{ text: "100" }]],
          [[], [{ text: "2" }], [{ text: "50" }]],
        ],
      },
    ])
  })

  test("a table style with a bold first row, turned on by the table, makes a header row", () => {
    const styles = `<w:style w:type="table" w:styleId="Grid4"><w:name w:val="Grid Table 4"/><w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr></w:tblStylePr></w:style>`
    const table = (look: string) =>
      `<w:tbl><w:tblPr><w:tblStyle w:val="Grid4"/><w:tblLook ${look}/></w:tblPr><w:tr>${cell("A")}</w:tr><w:tr>${cell("1")}</w:tr></w:tbl>`
    const [on, off, legacy] = readDocxBlocks(
      docx(table('w:firstRow="1"') + table('w:firstRow="0"') + table('w:val="04A0"'), { styles }),
    )
    expect(on).toMatchObject({ type: "table", headerRows: 1 })
    expect(off).not.toHaveProperty("headerRows")
    expect(legacy).toMatchObject({ type: "table", headerRows: 1 })
  })

  test("numbered paragraphs in a cell keep their number", () => {
    const numbering = `<w:abstractNum w:abstractNumId="0">${lvl(0, "decimal", "%1.")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`
    const body = `<w:tbl><w:tr><w:tc>${p("one", num(1))}${p("two", num(1))}</w:tc></w:tr></w:tbl>`
    expect(readDocxBlocks(docx(body, { numbering }))).toEqual([
      {
        type: "table",
        rows: [
          [[{ text: "1. " }, { text: "one" }, { text: "\n" }, { text: "2. " }, { text: "two" }]],
        ],
      },
    ])
  })

  test("a line break splits a paragraph into lines; in a heading it's a space", () => {
    const styles = `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>`
    const body = [
      `<w:p><w:pPr>${style("Heading1")}</w:pPr><w:r><w:t>Notices</w:t><w:br/><w:t>and addresses</w:t></w:r></w:p>`,
      `<w:p><w:r><w:t>Acme Ltd</w:t><w:br/><w:t>1 Kenyatta Avenue</w:t><w:br/><w:t>Nairobi</w:t></w:r></w:p>`,
    ].join("")
    expect(readDocxBlocks(docx(body, { styles }))).toEqual([
      { type: "heading", level: 1, text: "Notices and addresses", numbered: false },
      { type: "paragraph", runs: [{ text: "Acme Ltd" }] },
      { type: "paragraph", runs: [{ text: "1 Kenyatta Avenue" }] },
      { type: "paragraph", runs: [{ text: "Nairobi" }] },
    ])
  })
})

describe("readDocxBlocks: documents without heading styles", () => {
  test("a centred first line is the title; short bold or capitalised lines are headings", () => {
    const body = [
      p("Tenancy Agreement", '<w:jc w:val="center"/>'),
      p("This agreement is made today between the parties named below."),
      p("1. Rent", "", "<w:b/>"),
      p("The rent is due monthly."),
      p("TERMINATION"),
      p("Either party may end it.", "", "<w:b/>"),
      p("Important:", "", "<w:b/>"),
    ].join("")
    expect(readDocxBlocks(docx(body))).toEqual([
      { type: "heading", level: 1, text: "Tenancy Agreement", numbered: false },
      {
        type: "paragraph",
        runs: [{ text: "This agreement is made today between the parties named below." }],
      },
      { type: "heading", level: 1, text: "Rent", numbered: true, label: "1." },
      { type: "paragraph", runs: [{ text: "The rent is due monthly." }] },
      { type: "heading", level: 1, text: "TERMINATION", numbered: false },
      // A sentence, and a label ending in a colon, stay paragraphs.
      { type: "paragraph", runs: [{ text: "Either party may end it.", marks: ["bold"] }] },
      { type: "paragraph", runs: [{ text: "Important:", marks: ["bold"] }] },
    ])
  })

  test("with heading styles in use, bold lines stay paragraphs", () => {
    const styles = `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>`
    const body = [p("Rent", style("Heading1")), p("Note", "", "<w:b/>")].join("")
    expect(readDocxBlocks(docx(body, { styles }))).toEqual([
      { type: "heading", level: 1, text: "Rent", numbered: false },
      { type: "paragraph", runs: [{ text: "Note", marks: ["bold"] }] },
    ])
  })
})
