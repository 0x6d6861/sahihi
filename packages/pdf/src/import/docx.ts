import { ImportError, type ImportedBlock, type ImportedRun, type MarkType } from "@sahihi/core"
import { unzipSync } from "fflate"
import { DocxNumbering } from "./docx-numbering"
import { DocxStyles, type NumPr, type RunProps, readRunProp } from "./docx-styles"
import { xmlEvents } from "./xml"

/** A part bigger than this once unzipped is refused (a zip bomb, or not a document worth drafting). */
const MAX_PART_BYTES = 30 * 1024 * 1024
const PARTS = ["word/document.xml", "word/styles.xml", "word/numbering.xml"] as const

/**
 * A Word file's body as import blocks (docs/ai-documents.md → Import), styled as Word shows it:
 *
 * - bold, italic and underline, whether set on the text or by its paragraph or character style
 *   (Strong, Emphasis, a custom "Defined term"…), following `basedOn` chains; text formatted as
 *   capitals comes in as capitals; hidden text is left out;
 * - headings from the heading and title styles (and styles based on them) or an outline level;
 *   with no heading styles at all, short bold or capitalised lines are headings, and a short
 *   centred or bold first line is the title;
 * - Word's numbering, counted as Word counts it, including lists set by a paragraph style (List
 *   Number, List Bullet) and numbered headings: each item and heading carries the number Word
 *   prints ("3.", "2.1", "(a)") as its `label`;
 * - tables cell by cell, merged cells keeping their columns, header rows marked;
 * - line breaks inside a paragraph split it, so addresses and signature captions keep their lines.
 *
 * Deleted tracked changes, text boxes, field codes, headers, footers, footnotes and images are
 * left out.
 */
export function readDocxBlocks(bytes: Uint8Array): ImportedBlock[] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        (PARTS as readonly string[]).includes(f.name) && f.originalSize <= MAX_PART_BYTES,
    })
  } catch {
    throw new ImportError("unsupported")
  }
  const read = (name: string) => {
    const part = files[name]
    return part ? new TextDecoder().decode(part) : null
  }
  const document = read("word/document.xml")
  if (!document) throw new ImportError("unsupported")
  const styles = new DocxStyles(read("word/styles.xml"))
  const numbering = new DocxNumbering(read("word/numbering.xml"), styles)
  return bodyBlocks(document, styles, numbering)
}

interface Paragraph {
  runs: ImportedRun[]
  style: string | null
  outline: number | null
  num: NumPr
  centered: boolean
}

interface Run {
  style: string | null
  direct: RunProps
  resolved: RunProps | null
}

interface Table {
  rows: ImportedRun[][][]
  /** Rows marked to repeat as a header, counted from the top. */
  headerRows: number
  style: string | null
  firstRowLook: boolean
}

/** Elements whose content never reaches the body text (or is a past version of its formatting). */
const SKIPPED = new Set([
  "w:del",
  "w:moveFrom",
  "w:txbxContent",
  "mc:Fallback",
  "w:instrText",
  "w:delText",
  "w:footnoteReference",
  "w:endnoteReference",
  "w:pPrChange",
  "w:rPrChange",
  "w:tblPrChange",
  "w:trPrChange",
  "w:tcPrChange",
])

/** A top-level paragraph, with what's needed to promote it to a heading after the pass. */
interface Entry {
  block: ImportedBlock
  hint?: { centered: boolean; emphasised: boolean }
}

function bodyBlocks(xml: string, styles: DocxStyles, numbering: DocxNumbering): ImportedBlock[] {
  const entries: Entry[] = []
  // Tables, innermost last. Text of a table inside a cell joins that cell.
  const tables: Table[] = []
  let skip = 0
  let para: Paragraph | null = null
  let run: Run | null = null
  let inRunProps = false
  let inParaProps = false
  let inRowProps = false
  let inTableProps = false
  let inText = false
  let span = 1

  const table = () => tables[tables.length - 1]
  const row = () => {
    const t = table()
    return t?.rows[t.rows.length - 1]
  }
  const cell = () => {
    const r = row()
    return r?.[r.length - 1]
  }
  const push = (text: string) => {
    if (!para || !text) return
    if (run && !run.resolved) run.resolved = styles.effective(para.style, run.style, run.direct)
    const props = run?.resolved ?? null
    if (props?.hidden) return
    const marks: MarkType[] = []
    if (props?.bold) marks.push("bold")
    if (props?.italic) marks.push("italic")
    if (props?.underline) marks.push("underline")
    para.runs.push({
      text: props?.caps ? text.toLocaleUpperCase() : text,
      ...(marks.length ? { marks } : {}),
    })
  }

  for (const e of xmlEvents(xml)) {
    if (e.kind === "open" && SKIPPED.has(e.name)) {
      if (!e.selfClosing) skip++
      continue
    }
    if (e.kind === "close" && SKIPPED.has(e.name)) {
      skip = Math.max(0, skip - 1)
      continue
    }
    if (skip > 0) continue

    if (e.kind === "text") {
      if (inText) push(e.text)
      continue
    }
    if (e.kind === "open") {
      const val = e.attrs["w:val"]
      switch (e.name) {
        case "w:tbl":
          tables.push({ rows: [], headerRows: 0, style: null, firstRowLook: false })
          break
        case "w:tblPr":
          inTableProps = true
          break
        case "w:tblStyle":
          if (inTableProps && table()) (table() as Table).style = val ?? null
          break
        case "w:tblLook": {
          const t = table()
          if (!inTableProps || !t) break
          // Either the attribute (2010+) or the bit mask of the 2007 format.
          const flag = e.attrs["w:firstRow"]
          t.firstRowLook =
            flag !== undefined
              ? flag === "1" || flag === "true"
              : (Number.parseInt(val ?? "0", 16) & 0x20) !== 0
          break
        }
        case "w:tr":
          table()?.rows.push([])
          break
        case "w:trPr":
          inRowProps = true
          break
        case "w:tblHeader": {
          // A repeating header row; only an unbroken run of them from the top counts.
          const t = table()
          if (inRowProps && t && t.headerRows === t.rows.length - 1 && val !== "0") t.headerRows++
          break
        }
        case "w:gridBefore":
          // Cells missing at the start of a row: keep the rest in their columns.
          if (inRowProps) for (let i = 0; i < (Number(val) || 0); i++) row()?.push([])
          break
        case "w:tc":
          row()?.push([])
          span = 1
          break
        case "w:gridSpan":
          span = Math.max(1, Math.min(12, Number(val) || 1))
          break
        case "w:p":
          para = { runs: [], style: null, outline: null, num: {}, centered: false }
          break
        case "w:pPr":
          inParaProps = true
          break
        case "w:pStyle":
          if (para && inParaProps) para.style = val ?? null
          break
        case "w:outlineLvl":
          if (para && inParaProps) para.outline = Number(val)
          break
        case "w:numId":
          if (para && inParaProps) para.num.numId = val
          break
        case "w:ilvl":
          if (para && inParaProps) para.num.ilvl = Number(val) || 0
          break
        case "w:jc":
          if (para && inParaProps) para.centered = val === "center"
          break
        case "w:r":
          run = { style: null, direct: {}, resolved: null }
          break
        case "w:rPr":
          inRunProps = true
          break
        case "w:rStyle":
          if (run && inRunProps) run.style = val ?? null
          break
        case "w:t":
          inText = !e.selfClosing
          break
        case "w:tab":
        case "w:ptab":
          if (!inParaProps) push(" ")
          break
        case "w:br":
        case "w:cr":
          push("\n")
          break
        case "w:noBreakHyphen":
          push("-")
          break
        default:
          // The run's own bold, italic, underline, capitals, hidden (never the paragraph mark's).
          if (run && inRunProps) readRunProp(run.direct, e.name, e.attrs)
      }
      continue
    }
    // close
    switch (e.name) {
      case "w:tblPr":
        inTableProps = false
        break
      case "w:trPr":
        inRowProps = false
        break
      case "w:pPr":
        inParaProps = false
        break
      case "w:rPr":
        inRunProps = false
        break
      case "w:r":
        run = null
        break
      case "w:t":
        inText = false
        break
      case "w:tc":
        // A merged cell spans several columns: empty cells keep the next ones in place.
        for (let i = 1; i < span; i++) row()?.push([])
        span = 1
        break
      case "w:p": {
        const done = para
        para = null
        if (!done) break
        const numbered = numberOf(done, styles, numbering)
        const target = cell()
        if (target) {
          // A cell's paragraphs, one per line, numbered items with their number.
          const runs = numbered?.label ? [{ text: `${numbered.label} ` }, ...done.runs] : done.runs
          if (target.length && runsText(runs)) target.push({ text: "\n" })
          target.push(...runs)
        } else {
          entries.push(...toEntries(done, numbered, styles))
        }
        break
      }
      case "w:tbl": {
        const t = tables.pop()
        if (!t) break
        const outer = cell()
        if (outer) {
          // A table inside a cell: its text joins the cell, row by row.
          for (const r of t.rows) {
            if (outer.length) outer.push({ text: "\n" })
            r.forEach((c, i) => {
              if (i) outer.push({ text: " " })
              outer.push(...c)
            })
          }
        } else if (t.rows.length) {
          const headerRows =
            t.headerRows || (t.firstRowLook && styles.firstRowBold(t.style) ? 1 : 0)
          entries.push({
            block: { type: "table", rows: t.rows, ...(headerRows ? { headerRows } : {}) },
          })
        }
        break
      }
    }
  }
  return finish(entries)
}

const runsText = (runs: readonly ImportedRun[]) => runs.map((r) => r.text).join("")

/** The paragraph's list and level (its own, else its style's), counted; null if not numbered. */
function numberOf(
  p: Paragraph,
  styles: DocxStyles,
  numbering: DocxNumbering,
): { label: string; bullet: boolean } | null {
  const fromStyle = styles.numbering(p.style)
  const numId = p.num.numId ?? fromStyle.numId
  if (!numId || numId === "0") return null
  // The paragraph's own level, else the level the list links to its style (Heading 2 → 1.1),
  // else the level its style (or the style it's based on) sets.
  const ilvl =
    p.num.ilvl ??
    numbering.levelForStyle(numId, styles.paragraphStyle(p.style)) ??
    (p.num.numId === undefined ? fromStyle.ilvl : undefined) ??
    0
  return numbering.next(numId, ilvl)
}

const NUMBER_PREFIX = /^\s*(\d{1,3}(?:\.\d+)*[.)]?)\s+/

/** One top-level paragraph as blocks: a heading, a list item, or paragraphs (one per line). */
function toEntries(
  p: Paragraph,
  numbered: { label: string; bullet: boolean } | null,
  styles: DocxStyles,
): Entry[] {
  const text = runsText(p.runs)
  if (!text.trim()) return []
  // Outline level 9 is Word's "body text": explicitly not a heading.
  const level =
    p.outline !== null
      ? p.outline < 9
        ? p.outline + 1
        : undefined
      : styles.headingLevel(styles.paragraphStyle(p.style))
  if (level !== undefined) {
    const flat = text.replace(/\s+/g, " ").trim()
    if (numbered && !numbered.bullet && numbered.label) {
      return [heading(level, flat, numbered.label)]
    }
    const prefix = NUMBER_PREFIX.exec(flat)
    return [heading(level, prefix ? flat.slice(prefix[0].length) : flat, prefix?.[1])]
  }
  if (numbered) {
    const runs = p.runs.map((r) => ({ ...r, text: r.text.replace(/\n/g, " ") }))
    if (numbered.bullet) return [{ block: { type: "listItem", ordered: false, runs } }]
    return [
      {
        block: {
          type: "listItem",
          ordered: true,
          runs,
          ...(numbered.label ? { label: numbered.label } : {}),
        },
      },
    ]
  }
  // A line break splits the paragraph: each line its own paragraph.
  const lines: ImportedRun[][] = [[]]
  for (const run of p.runs) {
    run.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([])
      if (part) (lines[lines.length - 1] as ImportedRun[]).push({ ...run, text: part })
    })
  }
  return lines
    .filter((runs) => runsText(runs).trim())
    .map((runs, _, all) => ({
      block: { type: "paragraph", runs },
      // Only a one-line paragraph can be promoted to a heading or the title.
      ...(all.length === 1 && {
        hint: {
          centered: p.centered,
          emphasised: runs.every(
            (r) => !r.text.trim() || r.marks?.includes("bold") || r.marks?.includes("underline"),
          ),
        },
      }),
    }))
}

function heading(level: number, text: string, label?: string): Entry {
  return {
    block: {
      type: "heading",
      level: Math.max(1, level),
      text: text.trim(),
      numbered: Boolean(label),
      ...(label ? { label } : {}),
    },
  }
}

/** Short enough to be a heading or a title: a few words, no sentence punctuation at the end. */
function headingLike(text: string, maxWords: number): boolean {
  const t = text.trim()
  return (
    t.length > 0 &&
    t.length <= 100 &&
    t.split(/\s+/).length <= maxWords &&
    /\p{L}/u.test(t) &&
    !/[.,;:]$/.test(t)
  )
}

const allCaps = (text: string) => /\p{Lu}/u.test(text) && text === text.toLocaleUpperCase()

/**
 * After the pass: a document styled without headings gets them from its short bold or capitalised
 * lines (as a PDF's are found), and a short centred or bold first line is the title.
 */
function finish(entries: Entry[]): ImportedBlock[] {
  const styled = entries.some((e) => e.block.type === "heading")
  if (!styled) {
    for (const entry of entries) {
      const b = entry.block
      if (b.type !== "paragraph" || !entry.hint) continue
      const text = runsText(b.runs).replace(/\s+/g, " ").trim()
      const prefix = NUMBER_PREFIX.exec(text)
      const rest = prefix ? text.slice(prefix[0].length) : text
      const promoted =
        headingLike(rest, 10) &&
        ((entry.hint.emphasised && (prefix !== null || allCaps(rest) || headingLike(rest, 6))) ||
          (allCaps(rest) && headingLike(rest, 8)))
      if (promoted) entry.block = heading(1, rest, prefix?.[1]).block
    }
  }
  const first = entries[0]
  if (first?.block.type === "paragraph" && first.hint) {
    const text = runsText(first.block.runs).replace(/\s+/g, " ").trim()
    if (
      (first.hint.centered || first.hint.emphasised || allCaps(text)) &&
      headingLike(text, 12) &&
      !NUMBER_PREFIX.test(text)
    ) {
      first.block = heading(0, text).block
    }
  }
  return entries.map((e) => e.block)
}
