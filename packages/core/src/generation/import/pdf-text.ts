import type { MarkType } from "../model"
import type { ImportedBlock, ImportedRun } from "./blocks"

/**
 * A stretch of a page's text in one style, as the PDF reader found it: `[start, end)` indexes
 * into the page's text. `size` is the font size in points (0 when unknown).
 */
export interface PdfTextSpan {
  start: number
  end: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  size?: number
}

/** A page's text (as PDFium reads it: one line per visual line), with its styles when known. */
export interface PdfPageText {
  text: string
  spans?: readonly PdfTextSpan[]
}

/**
 * A PDF's text, page by page, as import blocks. A PDF keeps no structure, so this goes by layout
 * habits and by how the text looks, and never changes a word:
 *
 * - bold, italic and underline are kept on the words that have them (when the reader gives
 *   styles);
 * - headers and footers repeated on most pages, and page numbers, are dropped;
 * - fill-in lines ("Signature: ________") and bare signing labels left under a drawn line
 *   ("Signature", "Date") are dropped: signature blocks come from the Signers tab;
 * - the first line is the title when it reads like one (short, no closing punctuation), or when
 *   it's set larger than the text;
 * - a line that runs on (the one before fills the width and doesn't end a sentence) joins its
 *   paragraph, and a word broken with a hyphen at the end of a line is joined again;
 * - headings: short numbered lines ("3. Payment"), short all-capitals lines, "Article 4" or
 *   "Clause 2: Term", and short lines set larger than the text or in bold (when the text isn't);
 *   sub-clauses ("3.1 …") stay paragraphs with their number unless they're styled as headings.
 *   A heading's number is kept as its `label`;
 * - bullets and lettered items ("(a)", "b)", "i.") are list items, their marker kept as `label`.
 *
 * Tables can't be told from text and come through as paragraphs.
 */
export function pdfTextToBlocks(pages: readonly (string | PdfPageText)[]): ImportedBlock[] {
  const pageLines = pages.map((page) => toLines(typeof page === "string" ? { text: page } : page))
  const repeated = repeatedEdgeLines(pageLines.map((lines) => lines.map((l) => l.text)))
  const lines: (Line | null)[] = []
  let firstPageEnd = 0
  for (const [p, page] of pageLines.entries()) {
    for (const raw of page) {
      if (!raw.text) {
        lines.push(null)
        continue
      }
      const key = edgeKey(raw.text)
      if (repeated.has(key) || isPageNumber(raw.text) || BARE_LABEL.test(raw.text)) continue
      const line = withoutFillIns(raw)
      if (line === null) continue
      lines.push(line)
    }
    if (p === 0) firstPageEnd = lines.length
    // A page break ends a paragraph only when the page ends a sentence; `join` decides.
  }
  const texts = lines.map((l) => l?.text ?? "")
  const width = typicalWidth(texts)
  const look = bodyLook(lines)

  const blocks: ImportedBlock[] = []
  // The paragraph or list item being built, so a run-on line can join it.
  let open: { block: Extract<ImportedBlock, { runs: unknown }>; last: string } | null = null
  const first = lines.findIndex(Boolean)
  for (const [i, line] of lines.entries()) {
    if (!line) {
      open = null
      continue
    }
    // A line the open paragraph runs on into isn't a heading however it's styled.
    const continues = open !== null && runsOn(open.last, line.text, width)
    const heading =
      asHeading(line.text) ??
      (i === first ? asTitle(line, look, lines.slice(0, firstPageEnd)) : null) ??
      (continues ? null : asStyledHeading(line, look, lines[i + 1] ?? null))
    if (heading) {
      blocks.push(heading)
      open = null
      continue
    }
    const item = asListItem(line.text)
    if (item) {
      const block = {
        type: "listItem" as const,
        ordered: item.ordered,
        runs: lineRuns(sliceLine(line, line.text.length - item.text.length)),
        ...(item.label ? { label: item.label } : {}),
      }
      blocks.push(block)
      open = { block, last: line.text }
      continue
    }
    if (open && runsOn(open.last, line.text, width)) {
      joinLines(open.block.runs, lineRuns(line))
      open.last = line.text
      continue
    }
    const block = { type: "paragraph" as const, runs: lineRuns(line) }
    blocks.push(block)
    open = { block, last: line.text }
  }
  return blocks
}

// ── Styled lines ─────────────────────────────────────────────────────────────

interface Segment {
  text: string
  marks: MarkType[]
  size: number
}

interface Line {
  text: string
  segments: Segment[]
  /** The largest size of its words (0 when the reader gave no sizes). */
  size: number
  /** Every word is bold. */
  bold: boolean
}

const sameMarks = (a: readonly MarkType[], b: readonly MarkType[]) =>
  a.length === b.length && a.every((m, i) => m === b[i])

function marksOf(span: PdfTextSpan | undefined): MarkType[] {
  const marks: MarkType[] = []
  if (span?.bold) marks.push("bold")
  if (span?.italic) marks.push("italic")
  if (span?.underline) marks.push("underline")
  return marks
}

/**
 * A page as lines of styled segments. PDFium's line breaks become line ends; U+FFFD (characters
 * it couldn't map) and controls go; runs of white space become one space and lines are trimmed.
 */
function toLines(page: PdfPageText): Line[] {
  const spans = page.spans ?? []
  const lines: Line[] = []
  let segments: Segment[] = []
  let s = 0
  const text = page.text
  for (let i = 0; i < text.length; i++) {
    let ch = text[i] as string
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      lines.push(toLine(segments))
      segments = []
      continue
    }
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters
    if (/[\u0000-\u0008\u000b-\u001f\u007f�]/.test(ch)) continue
    if (ch === " " || ch === "\t") ch = " "
    while (s < spans.length && (spans[s] as PdfTextSpan).end <= i) s++
    const span = spans[s] && (spans[s] as PdfTextSpan).start <= i ? spans[s] : undefined
    const marks = marksOf(span)
    const size = span?.size ?? 0
    const last = segments[segments.length - 1]
    if (last && last.size === size && sameMarks(last.marks, marks)) last.text += ch
    else segments.push({ text: ch, marks, size })
  }
  lines.push(toLine(segments))
  return lines
}

/** Segments as a line: white space collapsed, ends trimmed, neighbours of one style merged. */
function toLine(raw: readonly Segment[]): Line {
  const segments: Segment[] = []
  let space = true
  for (const seg of raw) {
    let text = ""
    for (const ch of seg.text) {
      if (ch === " ") {
        if (!space) text += " "
        space = true
      } else {
        text += ch
        space = false
      }
    }
    if (!text) continue
    const last = segments[segments.length - 1]
    if (last && last.size === seg.size && sameMarks(last.marks, seg.marks)) last.text += text
    else segments.push({ ...seg, text })
  }
  // Spaces belong to the words they sit between: one between two words of one style takes it
  // ("whole agreement" underlined as one), one after a styled word that ends there goes plain.
  for (let i = 1; i < segments.length - 1; i++) {
    const [before, gap, after] = [segments[i - 1], segments[i], segments[i + 1]] as [
      Segment,
      Segment,
      Segment,
    ]
    if (gap.text === " " && sameMarks(before.marks, after.marks) && before.size === after.size) {
      before.text += ` ${after.text}`
      segments.splice(i, 2)
      i--
    }
  }
  for (let i = 0; i < segments.length - 1; i++) {
    const [seg, next] = [segments[i], segments[i + 1]] as [Segment, Segment]
    if (seg.marks.length && seg.text.endsWith(" ") && !next.marks.length) {
      seg.text = seg.text.slice(0, -1)
      next.text = ` ${next.text}`
    }
  }
  const kept = segments.filter((seg) => seg.text)
  segments.length = 0
  segments.push(...kept)
  // Trim the end.
  while (segments.length) {
    const last = segments[segments.length - 1] as Segment
    last.text = last.text.replace(/ +$/, "")
    if (last.text) break
    segments.pop()
  }
  const worded = segments.filter((seg) => /[\p{L}\p{N}]/u.test(seg.text))
  return {
    text: segments.map((seg) => seg.text).join(""),
    segments,
    size: Math.max(0, ...worded.map((seg) => seg.size)),
    bold: worded.length > 0 && worded.every((seg) => seg.marks.includes("bold")),
  }
}

/** The line without its first `n` characters (a list marker), re-trimmed. */
function sliceLine(line: Line, n: number): Line {
  const segments: Segment[] = []
  let skip = n
  for (const seg of line.segments) {
    if (skip >= seg.text.length) {
      skip -= seg.text.length
      continue
    }
    segments.push({ ...seg, text: seg.text.slice(skip) })
    skip = 0
  }
  if (segments[0]) segments[0].text = segments[0].text.replace(/^ +/, "")
  return toLine(segments)
}

function lineRuns(line: Line): ImportedRun[] {
  return line.segments.map((seg) => ({
    text: seg.text,
    ...(seg.marks.length ? { marks: [...seg.marks] } : {}),
  }))
}

function pushRun(runs: ImportedRun[], run: ImportedRun) {
  const last = runs[runs.length - 1]
  if (last && sameMarks(last.marks ?? [], run.marks ?? [])) last.text += run.text
  else runs.push({ ...run })
}

/**
 * Joins a run-on line to its block, mending a word hyphenated across the break ("agree-" +
 * "ment"). The space between takes the style both sides share, so a bold phrase stays one run.
 */
function joinLines(runs: ImportedRun[], next: ImportedRun[]) {
  const last = runs[runs.length - 1]
  const head = next[0]
  if (!last || !head) {
    for (const run of next) pushRun(runs, run)
    return
  }
  if (/\p{Ll}-$/u.test(last.text) && /^\p{Ll}/u.test(head.text)) {
    last.text = last.text.slice(0, -1)
  } else {
    const shared = (last.marks ?? []).filter((m) => head.marks?.includes(m))
    pushRun(runs, { text: " ", ...(shared.length ? { marks: shared } : {}) })
  }
  for (const run of next) pushRun(runs, run)
}

// ── How the text usually looks ───────────────────────────────────────────────

interface Look {
  /** The size most of the text is set in (0 when unknown). */
  size: number
  /** Most of the text is bold (then bold says nothing about headings). */
  bold: boolean
}

function bodyLook(lines: readonly (Line | null)[]): Look {
  const bySize = new Map<number, number>()
  let bold = 0
  let total = 0
  for (const line of lines) {
    for (const seg of line?.segments ?? []) {
      const n = seg.text.replace(/\s/g, "").length
      bySize.set(seg.size, (bySize.get(seg.size) ?? 0) + n)
      if (seg.marks.includes("bold")) bold += n
      total += n
    }
  }
  const size = [...bySize].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  return { size, bold: total > 0 && bold > total / 2 }
}

/** Set larger than the text: a heading or title size. */
const larger = (line: Line, look: Look, factor: number) =>
  look.size > 0 && line.size >= look.size * factor

/** Short enough to be a heading: a few words, no sentence punctuation at the end. */
function headingLike(text: string, maxWords: number): boolean {
  return (
    text.length <= MAX_HEADING &&
    text.split(" ").length <= maxWords &&
    /\p{L}/u.test(text) &&
    !/[.,;:]$/.test(text)
  )
}

// ── Headers, footers, fill-ins ───────────────────────────────────────────────

/** A header or footer compares without its digits ("Page 3", "Page 4" are the same line). */
const edgeKey = (line: string) => line.toLowerCase().replace(/\d+/g, "#")

/** Lines among the first and last three of at least 60% of pages (3 pages or more). */
function repeatedEdgeLines(pages: string[][]): Set<string> {
  if (pages.length < 3) return new Set()
  const counts = new Map<string, number>()
  for (const page of pages) {
    const filled = page.filter(Boolean)
    const edges = new Set([...filled.slice(0, 3), ...filled.slice(-3)].map(edgeKey))
    for (const key of edges) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return new Set(
    [...counts].filter(([, n]) => n >= Math.max(3, pages.length * 0.6)).map(([key]) => key),
  )
}

function isPageNumber(line: string): boolean {
  return /^(?:page\s+)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(line) || /^[-–]\s*\d+\s*[-–]$/.test(line)
}

const FILL_IN = /[_.…]{4,}/
const FILL_INS = /[_.…]{4,}/g
/** A signing label alone on its line, as a drawn signature line's caption: nothing else on it. */
const BARE_LABEL = /^(?:signature|name|full name|date|date signed|initials|witness)\s*:?$/i
const SIGNING_LABEL =
  /^(?:signature|signed|sign here|name|full name|date|title|witness|position|for and on behalf of)\b[^a-z]*$/i

/** Without its fill-in lines; null when nothing worth keeping is left. */
function withoutFillIns(line: Line): Line | null {
  if (!FILL_IN.test(line.text)) return line
  const rest = toLine(
    line.segments.map((seg) => ({ ...seg, text: seg.text.replace(FILL_INS, " ") })),
  )
  if (!/[\p{L}\p{N}]/u.test(rest.text) || SIGNING_LABEL.test(rest.text)) return null
  return rest
}

/** The usual length of a full line: longer lines in a paragraph run on. */
function typicalWidth(lines: string[]): number {
  const lengths = lines
    .filter((l) => l.length > 20)
    .map((l) => l.length)
    .sort((a, b) => a - b)
  return lengths[Math.floor(lengths.length * 0.75)] ?? 80
}

// ── Headings, titles, list items ─────────────────────────────────────────────

const MAX_HEADING = 80
/** A heading's number as printed: "3.", "3)", "3", "2.1". */
const HEADING_NUMBER = /^(\d{1,3}(?:\.\d{1,3})*[.)]?)\s+(.+)$/

function heading(text: string, label?: string): Extract<ImportedBlock, { type: "heading" }> {
  return {
    type: "heading",
    level: 1,
    text,
    numbered: Boolean(label),
    ...(label ? { label } : {}),
  }
}

function asHeading(line: string): Extract<ImportedBlock, { type: "heading" }> | null {
  if (line.length > MAX_HEADING) return null
  // "3. Payment", "3) PAYMENT", "3 Payment terms"; not "3.1 …" (a sub-clause) or a sentence.
  const numbered = /^(\d{1,3}[.)]?)\s+(\p{Lu}.*)$/u.exec(line)
  if (numbered?.[2] && !/[.;,]$/.test(numbered[2]) && numbered[2].split(" ").length <= 10) {
    return heading(numbered[2], numbered[1])
  }
  // "Article 4", "Clause 2: Term", "SECTION 5 - NOTICES"
  const named =
    /^(?:article|clause|section|schedule|annex|appendix)\s+[\dIVXivx]+\b[\s.:–-]*(.*)$/i.exec(line)
  if (named && !/[.;,]$/.test(line)) return heading(named[1]?.trim() || line)
  // ALL CAPITALS: at least three letters, none lower case.
  const letters = line.replace(/[^\p{L}]/gu, "")
  if (letters.length >= 3 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)) {
    if (!/[,;]$/.test(line)) return heading(line)
  }
  return null
}

/**
 * A short line styled as a heading: larger than the text, or bold where the text isn't. Not one
 * the next line continues (it starts in lower case), and not a list item.
 */
function asStyledHeading(
  line: Line,
  look: Look,
  next: Line | null,
): Extract<ImportedBlock, { type: "heading" }> | null {
  if (!larger(line, look, 1.15) && !(line.bold && !look.bold)) return null
  if (!/^[\p{Lu}\p{N}]/u.test(line.text) || asListItem(line.text)) return null
  if (next && /^\p{Ll}/u.test(next.text)) return null
  const numbered = HEADING_NUMBER.exec(line.text)
  const text = numbered?.[2] ?? line.text
  if (!headingLike(text, 12)) return null
  return heading(text, numbered?.[1])
}

/**
 * A document's first line as its title: short, capitalised, not a sentence or a list item; or
 * set larger than the text and the largest on its page.
 */
function asTitle(
  line: Line,
  look: Look,
  firstPage: readonly (Line | null)[],
): Extract<ImportedBlock, { type: "heading" }> | null {
  const text = line.text
  if (text.length > MAX_HEADING || text.split(" ").length > 12) return null
  if (/[.,;:]$/.test(text) || asListItem(text) || HEADING_NUMBER.test(text)) return null
  const largest = Math.max(0, ...firstPage.map((l) => l?.size ?? 0))
  if (larger(line, look, 1.2) && line.size >= largest) return heading(text)
  if (!/^\p{Lu}/u.test(text)) return null
  return heading(text)
}

function asListItem(line: string): { ordered: boolean; text: string; label?: string } | null {
  // Word's bullets often come from Symbol or Wingdings, as private-use characters.
  const bullet = /^(?:[•●▪◦‣·∙*–-]\s+|[\uf000-\uf0ff]\s*)(.+)$/u.exec(line)
  if (bullet?.[1]) return { ordered: false, text: bullet[1] }
  const lettered = /^(\((?:[a-z]|[ivx]{1,4})\)|(?:[a-z]|[ivx]{1,4})[).])\s+(.+)$/.exec(line)
  if (lettered?.[1] && lettered[2]) return { ordered: true, text: lettered[2], label: lettered[1] }
  return null
}

/** The next line continues this one: this one fills the width and doesn't end a sentence. */
function runsOn(previous: string, line: string, width: number): boolean {
  if (/[a-z]-$/.test(previous) && /^\p{Ll}/u.test(line)) return true
  if (/[.!?:;]["”’)]?$/.test(previous)) return /^\p{Ll}/u.test(line)
  return previous.length >= width * 0.7 || /^\p{Ll}/u.test(line)
}
