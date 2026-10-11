import { ImportError, type ImportedBlock, type ImportedRun, type MarkType } from "@sahihi/core"
import { unzipSync } from "fflate"
import { xmlEvents } from "./xml"

/** A part bigger than this once unzipped is refused (a zip bomb, or not a document worth drafting). */
const MAX_PART_BYTES = 30 * 1024 * 1024
const PARTS = ["word/document.xml", "word/styles.xml", "word/numbering.xml"] as const

/**
 * A Word file's body as import blocks (docs/ai-documents.md → Import): paragraphs with bold,
 * italic and underline, headings from the heading and title styles (or an outline level), list
 * items from Word's numbering (bullets vs numbered), and tables cell by cell. Deleted tracked
 * changes, text boxes, field codes, headers, footers, footnotes and images are left out.
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
  const headings = headingStyles(read("word/styles.xml"))
  const bullets = bulletLists(read("word/numbering.xml"))
  return bodyBlocks(document, headings, bullets)
}

/** Style id → heading level, from styles named "heading n" or "Title" (or with an outline level). */
function headingStyles(xml: string | null): Map<string, number> {
  const levels = new Map<string, number>()
  if (!xml) return levels
  let id: string | null = null
  for (const e of xmlEvents(xml)) {
    if (e.kind === "open" && e.name === "w:style") id = e.attrs["w:styleId"] ?? null
    else if (e.kind === "close" && e.name === "w:style") id = null
    else if (e.kind === "open" && id) {
      if (e.name === "w:name") {
        const name = (e.attrs["w:val"] ?? "").toLowerCase()
        const heading = /^heading\s*(\d)$/.exec(name)
        if (heading) levels.set(id, Number(heading[1]))
        else if (name === "title") levels.set(id, 0)
      } else if (e.name === "w:outlineLvl" && !levels.has(id)) {
        const level = Number(e.attrs["w:val"])
        if (level >= 0 && level < 9) levels.set(id, level + 1)
      }
    }
  }
  return levels
}

/** `numId:ilvl` pairs whose list format is a bullet (everything else counts as numbered). */
function bulletLists(xml: string | null): Set<string> {
  const bullets = new Set<string>()
  if (!xml) return bullets
  const abstractBullets = new Map<string, Set<string>>()
  const numToAbstract = new Map<string, string>()
  let abstract: string | null = null
  let level: string | null = null
  let num: string | null = null
  for (const e of xmlEvents(xml)) {
    if (e.kind === "open") {
      if (e.name === "w:abstractNum") abstract = e.attrs["w:abstractNumId"] ?? null
      else if (e.name === "w:lvl") level = e.attrs["w:ilvl"] ?? "0"
      else if (e.name === "w:numFmt" && abstract && level && e.attrs["w:val"] === "bullet") {
        const set = abstractBullets.get(abstract) ?? new Set<string>()
        set.add(level)
        abstractBullets.set(abstract, set)
      } else if (e.name === "w:num") num = e.attrs["w:numId"] ?? null
      else if (e.name === "w:abstractNumId" && num) numToAbstract.set(num, e.attrs["w:val"] ?? "")
    } else if (e.kind === "close") {
      if (e.name === "w:abstractNum") abstract = null
      else if (e.name === "w:lvl") level = null
      else if (e.name === "w:num") num = null
    }
  }
  for (const [numId, abstractId] of numToAbstract) {
    for (const lvl of abstractBullets.get(abstractId) ?? []) bullets.add(`${numId}:${lvl}`)
  }
  return bullets
}

interface Paragraph {
  runs: ImportedRun[]
  style: string | null
  outline: number | null
  numId: string | null
  ilvl: string
}

/** Elements whose content never reaches the body text. */
const SKIPPED = new Set([
  "w:del",
  "w:moveFrom",
  "w:txbxContent",
  "mc:Fallback",
  "w:instrText",
  "w:delText",
  "w:footnoteReference",
  "w:endnoteReference",
])

function bodyBlocks(
  xml: string,
  headings: Map<string, number>,
  bullets: Set<string>,
): ImportedBlock[] {
  const blocks: ImportedBlock[] = []
  // Tables, innermost last. Text of a table inside a cell joins that cell.
  const tables: { rows: ImportedRun[][][] }[] = []
  let skip = 0
  let para: Paragraph | null = null
  let marks: { bold: boolean; italic: boolean; underline: boolean } | null = null
  let inRunProps = false
  let inParaProps = false
  let inText = false

  const cell = () => {
    const table = tables[tables.length - 1]
    const row = table?.rows[table.rows.length - 1]
    return row?.[row.length - 1]
  }
  const push = (text: string) => {
    if (!para || !text) return
    const runMarks: MarkType[] = []
    if (marks?.bold) runMarks.push("bold")
    if (marks?.italic) runMarks.push("italic")
    if (marks?.underline) runMarks.push("underline")
    para.runs.push({ text, ...(runMarks.length ? { marks: runMarks } : {}) })
  }
  const on = (attrs: Record<string, string>) => {
    const v = attrs["w:val"]
    return v === undefined || !["0", "false", "none"].includes(v)
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
      switch (e.name) {
        case "w:tbl":
          tables.push({ rows: [] })
          break
        case "w:tr":
          tables[tables.length - 1]?.rows.push([])
          break
        case "w:tc": {
          const table = tables[tables.length - 1]
          table?.rows[table.rows.length - 1]?.push([])
          break
        }
        case "w:p":
          para = { runs: [], style: null, outline: null, numId: null, ilvl: "0" }
          break
        case "w:pPr":
          inParaProps = true
          break
        case "w:pStyle":
          if (para && inParaProps) para.style = e.attrs["w:val"] ?? null
          break
        case "w:outlineLvl":
          if (para && inParaProps) para.outline = Number(e.attrs["w:val"])
          break
        case "w:numId":
          if (para && inParaProps) para.numId = e.attrs["w:val"] ?? null
          break
        case "w:ilvl":
          if (para && inParaProps) para.ilvl = e.attrs["w:val"] ?? "0"
          break
        case "w:r":
          marks = { bold: false, italic: false, underline: false }
          break
        case "w:rPr":
          inRunProps = true
          break
        case "w:b":
          if (marks && inRunProps) marks.bold = on(e.attrs)
          break
        case "w:i":
          if (marks && inRunProps) marks.italic = on(e.attrs)
          break
        case "w:u":
          if (marks && inRunProps) marks.underline = on(e.attrs)
          break
        case "w:t":
          inText = !e.selfClosing
          break
        case "w:tab":
          if (!inParaProps) push(" ")
          break
        case "w:br":
        case "w:cr":
          push(tables.length ? "\n" : " ")
          break
        case "w:noBreakHyphen":
          push("-")
          break
      }
      continue
    }
    // close
    switch (e.name) {
      case "w:pPr":
        inParaProps = false
        break
      case "w:rPr":
        inRunProps = false
        break
      case "w:r":
        marks = null
        break
      case "w:t":
        inText = false
        break
      case "w:p": {
        const done = para
        para = null
        if (!done) break
        const target = cell()
        if (target) {
          // A cell's paragraphs, one per line.
          if (target.length && done.runs.length) target.push({ text: "\n" })
          target.push(...done.runs)
        } else {
          const block = toBlock(done, headings, bullets)
          if (block) blocks.push(block)
        }
        break
      }
      case "w:tbl": {
        const table = tables.pop()
        if (!table) break
        const outer = cell()
        if (outer) {
          // A table inside a cell: its text joins the cell, row by row.
          for (const row of table.rows) {
            if (outer.length) outer.push({ text: "\n" })
            row.forEach((c, i) => {
              if (i) outer.push({ text: " " })
              outer.push(...c)
            })
          }
        } else if (table.rows.length) blocks.push({ type: "table", rows: table.rows })
        break
      }
    }
  }
  return blocks
}

const NUMBER_PREFIX = /^\s*(\d{1,3}(?:\.\d+)*)[.)]?\s+/

function toBlock(
  p: Paragraph,
  headings: Map<string, number>,
  bullets: Set<string>,
): ImportedBlock | null {
  const text = p.runs.map((r) => r.text).join("")
  if (!text.trim()) return null
  const styleLevel = p.style ? headings.get(p.style) : undefined
  const level = styleLevel ?? (p.outline !== null && p.outline < 9 ? p.outline + 1 : undefined)
  const listed = p.numId !== null && p.numId !== "0"
  if (level !== undefined) {
    const prefix = NUMBER_PREFIX.exec(text)
    return {
      type: "heading",
      level: Math.max(1, level),
      text: (prefix ? text.slice(prefix[0].length) : text).trim(),
      numbered: listed || Boolean(prefix),
    }
  }
  if (listed) {
    return {
      type: "listItem",
      ordered: !bullets.has(`${p.numId}:${p.ilvl}`),
      runs: p.runs,
    }
  }
  return { type: "paragraph", runs: p.runs }
}
