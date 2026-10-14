import { structureIssues } from "../document"
import {
  type BlockNode,
  type GeneratedDocumentData,
  GeneratedDocumentDataSchema,
  type InlineNode,
  type Paragraph,
  type Section,
  type TableCell,
} from "../model"
import {
  blocksLength,
  ImportError,
  type ImportedBlock,
  type ImportedRun,
  MAX_IMPORT_CHARS,
  runsText,
} from "./blocks"

const MAX_SECTIONS = 200
const MAX_BLOCKS = 200
const MAX_TITLE = 120
const MAX_TEXT_NODE = 10_000
const MAX_INLINE = 500
const MAX_TABLE_COLUMNS = 12
const MAX_TABLE_ROWS = 200

/** The signer an imported document starts with: who signs is set afterwards (Signers tab). */
export const IMPORTED_SIGNER = { key: "signer_1", label: "Signer 1" } as const

/**
 * Import blocks as a generated document (docs/ai-documents.md → Import), word for word:
 *
 * - the first heading, if it's short and comes first, is the title; otherwise `fallbackTitle`
 *   (the file's name);
 * - each heading starts a section, numbered only if the source numbered it; text before the first
 *   heading goes in an unnumbered "Introduction". A heading whose source number (`label`) isn't
 *   the one its section would get ("2.1", "Article 4") keeps that number in an unnumbered title,
 *   so cross-references still point at the right clause;
 * - paragraphs and list items keep their bold, italic and underline; consecutive items form one
 *   list. A numbered item whose source number isn't the renderer's "(a)", "(b)"… for its place
 *   becomes a paragraph starting with that number. Tables keep their cells (padded to a grid, at
 *   most 12 columns, extras joined into the last) and their header rows;
 * - no blanks, and one signer without fields: the assistant proposes both afterwards.
 *
 * Throws `ImportError` when there's no text or too much of it.
 */
export function importContent(
  blocks: readonly ImportedBlock[],
  fallbackTitle: string,
): GeneratedDocumentData {
  const kept = blocks.filter(hasText)
  if (kept.length === 0) throw new ImportError("no_text")
  if (blocksLength(kept) > MAX_IMPORT_CHARS) throw new ImportError("too_large")

  let title = cleanTitle(fallbackTitle) || "Imported document"
  const first = kept[0]
  if (first?.type === "heading" && !first.label && first.text.length <= MAX_TITLE) {
    title = first.text
    kept.shift()
  }

  const sections: Section[] = []
  let current: Section | null = null
  let n = 0
  let numberedCount = 0
  const open = (heading: string, numbered: boolean) => {
    if (numbered) numberedCount++
    current = {
      type: "section",
      attrs: { id: `s${++n}`, title: heading.slice(0, 200), numbered },
      content: [],
    }
    sections.push(current)
    return current
  }
  const target = (): Section => {
    const s: Section = current ?? open("Introduction", false)
    // A section holds at most 200 blocks: carry on in an unnumbered continuation.
    return s.content.length < MAX_BLOCKS ? s : open(`${s.attrs.title} (continued)`, false)
  }

  for (const block of kept) {
    if (block.type === "heading") {
      // The source's own number stays when the section's would differ ("2.1", "Article 4").
      const own = block.label === undefined || sameNumber(block.label, String(numberedCount + 1))
      const text = own ? block.text : `${block.label} ${block.text}`
      if (sections.length < MAX_SECTIONS) open(text, own && block.numbered)
      // Past the limit, a heading stays as a bold line in the last section.
      else target().content.push(paragraph([{ text, marks: ["bold"] }]))
      continue
    }
    const section = target()
    if (block.type === "paragraph") section.content.push(paragraph(block.runs))
    else if (block.type === "listItem") {
      const type = block.ordered ? "orderedList" : "bulletList"
      const last = section.content[section.content.length - 1]
      const position = last?.type === type && last.content.length < 100 ? last.content.length : 0
      if (block.ordered && block.label !== undefined && block.label !== listLabel(position)) {
        // Numbered differently from what the renderer would print: keep the source's number.
        section.content.push(paragraph(labelled(block.label, block.runs)))
        continue
      }
      const item = { type: "listItem" as const, content: [paragraph(block.runs)] as [Paragraph] }
      if (last?.type === type && position > 0) last.content.push(item)
      else section.content.push({ type, content: [item] })
    } else {
      const table = tableNode(block.rows, block.headerRows ?? 0)
      if (table) section.content.push(table)
    }
  }
  if (sections.length === 0) throw new ImportError("no_text")

  const data = GeneratedDocumentDataSchema.parse({
    title,
    pageSize: "A4",
    content: { type: "doc", content: sections },
    variables: [],
    roles: [
      {
        ...IMPORTED_SIGNER,
        recipientRole: "SIGNER",
        name: null,
        email: null,
        initialsOnEveryPage: false,
      },
    ],
  })
  if (structureIssues(data).length) throw new ImportError("unsupported")
  return data
}

function hasText(block: ImportedBlock): boolean {
  if (block.type === "heading") return block.text.trim().length > 0
  if (block.type === "table") return block.rows.some((r) => r.some((c) => runsText(c).trim()))
  return runsText(block.runs).trim().length > 0
}

/** A file name as a title: no extension, separators as spaces, a capital first letter. */
function cleanTitle(name: string): string {
  const title = name
    .replace(/\.(pdf|docx)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE)
  return title.charAt(0).toUpperCase() + title.slice(1)
}

/** Runs as inline nodes: neighbours with the same marks merged, long text split. */
function inline(runs: readonly ImportedRun[]): InlineNode[] {
  const out: InlineNode[] = []
  for (const run of runs) {
    const text = run.text.replace(/\s+/g, " ")
    if (!text) continue
    const marks = [...new Set(run.marks ?? [])].sort()
    const key = marks.join(",")
    const last = out[out.length - 1]
    if (last?.type === "text" && (last.marks ?? []).map((m) => m.type).join(",") === key) {
      last.text += text
    } else {
      out.push({
        type: "text",
        text,
        ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
      })
    }
  }
  // Trim the paragraph's edges, then split nodes over the length limit.
  const firstNode = out[0]
  if (firstNode?.type === "text") firstNode.text = firstNode.text.trimStart()
  const lastNode = out[out.length - 1]
  if (lastNode?.type === "text") lastNode.text = lastNode.text.trimEnd()
  const nodes = out
    .filter((node) => node.type !== "text" || node.text)
    .flatMap((node) => {
      if (node.type !== "text" || node.text.length <= MAX_TEXT_NODE) return [node]
      const parts: InlineNode[] = []
      for (let i = 0; i < node.text.length; i += MAX_TEXT_NODE) {
        parts.push({ ...node, text: node.text.slice(i, i + MAX_TEXT_NODE) })
      }
      return parts
    })
  return nodes.slice(0, MAX_INLINE)
}

const paragraph = (runs: readonly ImportedRun[]): Paragraph => ({
  type: "paragraph",
  content: inline(runs),
})

/** How the renderer numbers an ordered list's items: (a), (b)… (packages/pdf compose). */
function listLabel(index: number): string {
  return `(${String.fromCharCode(97 + (index % 26))})`
}

/** "3." and "3" are the same section number; "3.1" and "Article 3" aren't. */
function sameNumber(label: string, number: string): boolean {
  return label.replace(/[.)]$/, "") === number
}

/** A label in front of the runs, plain (the source's number isn't emphasised by its runs). */
function labelled(label: string, runs: readonly ImportedRun[]): ImportedRun[] {
  return label ? [{ text: `${label} ` }, ...runs] : [...runs]
}

/**
 * A plain grid: rows padded to the widest, extra columns joined into the last cell. The first
 * `headerRows` rows are header cells (rendered bold).
 */
function tableNode(rows: ImportedRun[][][], headerRows: number): BlockNode | null {
  const kept = rows.filter((r) => r.length > 0).slice(0, MAX_TABLE_ROWS)
  if (kept.length === 0) return null
  const width = Math.min(MAX_TABLE_COLUMNS, Math.max(...kept.map((r) => r.length)))
  return {
    type: "table",
    content: kept.map((row, r) => {
      const cells = row.slice(0, width)
      if (row.length > width) {
        cells[width - 1] = row.slice(width - 1).flatMap((c, i) => (i ? [{ text: " " }, ...c] : c))
      }
      while (cells.length < width) cells.push([])
      return {
        type: "tableRow" as const,
        content: cells.map(
          (runs): TableCell => ({
            type: r < headerRows && r < kept.length - 1 ? "tableHeader" : "tableCell",
            attrs: { colspan: 1, rowspan: 1, colwidth: null },
            content: cellParagraphs(runs),
          }),
        ),
      }
    }),
  }
}

/** A cell's text, one paragraph per line (at most 20). */
function cellParagraphs(runs: ImportedRun[]): Paragraph[] {
  const lines: ImportedRun[][] = [[]]
  for (const run of runs) {
    const parts = run.text.split("\n")
    parts.forEach((part, i) => {
      if (i > 0) lines.push([])
      if (part) (lines[lines.length - 1] as ImportedRun[]).push({ ...run, text: part })
    })
  }
  const paragraphs = lines.map(paragraph).slice(0, 20)
  return paragraphs.length ? paragraphs : [{ type: "paragraph", content: [] }]
}
