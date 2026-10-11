import type { ImportedBlock } from "./blocks"

/**
 * A PDF's text, page by page (as PDFium reads it: one line per visual line), as import blocks. A
 * PDF keeps no structure, so this goes by layout habits, and never changes a word:
 *
 * - headers and footers repeated on most pages, and page numbers, are dropped;
 * - fill-in lines ("Signature: ________") and bare signing labels left under a drawn line
 *   ("Signature", "Date") are dropped: signature blocks come from the Signers tab;
 * - the first line is the title when it reads like one (short, no closing punctuation);
 * - a line that runs on (the one before fills the width and doesn't end a sentence) joins its
 *   paragraph, and a word broken with a hyphen at the end of a line is joined again;
 * - short numbered lines ("3. Payment") and short all-capitals lines are headings, and "Article 4"
 *   or "Clause 2: Term" too; sub-clauses ("3.1 …") stay paragraphs with their number;
 * - bullets and lettered items ("(a)", "b)", "i.") are list items, without their marker.
 *
 * Tables can't be told from text and come through as paragraphs.
 */
export function pdfTextToBlocks(pages: readonly string[]): ImportedBlock[] {
  const pageLines = pages.map((text) =>
    clean(text)
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim()),
  )
  const repeated = repeatedEdgeLines(pageLines)
  const lines: string[] = []
  for (const page of pageLines) {
    for (const raw of page) {
      if (!raw) {
        lines.push("")
        continue
      }
      if (repeated.has(edgeKey(raw)) || isPageNumber(raw) || BARE_LABEL.test(raw)) continue
      const line = withoutFillIns(raw)
      if (line === null) continue
      lines.push(line)
    }
    // A page break ends a paragraph only when the page ends a sentence; `join` decides.
  }
  const width = typicalWidth(lines)

  const blocks: ImportedBlock[] = []
  // The paragraph or list item being built, so a run-on line can join it.
  let open: { block: Extract<ImportedBlock, { runs: unknown }>; last: string } | null = null
  const first = lines.findIndex(Boolean)
  for (const [i, line] of lines.entries()) {
    if (!line) {
      open = null
      continue
    }
    const heading = asHeading(line) ?? (i === first ? asTitle(line) : null)
    if (heading) {
      blocks.push(heading)
      open = null
      continue
    }
    const item = asListItem(line)
    if (item) {
      const block = {
        type: "listItem" as const,
        ordered: item.ordered,
        runs: [{ text: item.text }],
      }
      blocks.push(block)
      open = { block, last: line }
      continue
    }
    if (open && runsOn(open.last, line, width)) {
      const run = open.block.runs[0] as { text: string }
      run.text = joinLines(run.text, line)
      open.last = line
      continue
    }
    const block = { type: "paragraph" as const, runs: [{ text: line }] }
    blocks.push(block)
    open = { block, last: line }
  }
  return blocks
}

/** PDFium's line breaks become "\n"; U+FFFD (characters it couldn't map) and controls go. */
function clean(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f�]/g, "")
      .replace(/ /g, " ")
  )
}

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
function withoutFillIns(line: string): string | null {
  if (!FILL_IN.test(line)) return line
  const rest = line.replace(FILL_INS, " ").replace(/\s+/g, " ").trim()
  if (!/[\p{L}\p{N}]/u.test(rest) || SIGNING_LABEL.test(rest)) return null
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

const MAX_HEADING = 80

function asHeading(line: string): Extract<ImportedBlock, { type: "heading" }> | null {
  if (line.length > MAX_HEADING) return null
  // "3. Payment", "3) PAYMENT", "3 Payment terms"; not "3.1 …" (a sub-clause) or a sentence.
  const numbered = /^(\d{1,3})[.)]?\s+(\p{Lu}.*)$/u.exec(line)
  if (numbered?.[2] && !/[.;,]$/.test(numbered[2]) && numbered[2].split(" ").length <= 10) {
    return { type: "heading", level: 1, text: numbered[2], numbered: true }
  }
  // "Article 4", "Clause 2: Term", "SECTION 5 - NOTICES"
  const named =
    /^(?:article|clause|section|schedule|annex|appendix)\s+[\dIVXivx]+\b[\s.:–-]*(.*)$/i.exec(line)
  if (named && !/[.;,]$/.test(line)) {
    return { type: "heading", level: 1, text: named[1]?.trim() || line, numbered: false }
  }
  // ALL CAPITALS: at least three letters, none lower case.
  const letters = line.replace(/[^\p{L}]/gu, "")
  if (letters.length >= 3 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)) {
    if (!/[,;]$/.test(line)) return { type: "heading", level: 1, text: line, numbered: false }
  }
  return null
}

/** A document's first line as its title: short, capitalised, not a sentence or a list item. */
function asTitle(line: string): Extract<ImportedBlock, { type: "heading" }> | null {
  if (line.length > MAX_HEADING || line.split(" ").length > 12) return null
  if (!/^\p{Lu}/u.test(line) || /[.,;:]$/.test(line) || asListItem(line)) return null
  return { type: "heading", level: 1, text: line, numbered: false }
}

function asListItem(line: string): { ordered: boolean; text: string } | null {
  const bullet = /^[•●▪◦‣·∙*–-]\s+(.+)$/.exec(line)
  if (bullet?.[1]) return { ordered: false, text: bullet[1] }
  const lettered = /^(?:\((?:[a-z]|[ivx]{1,4})\)|(?:[a-z]|[ivx]{1,4})[).])\s+(.+)$/.exec(line)
  if (lettered?.[1]) return { ordered: true, text: lettered[1] }
  return null
}

/** The next line continues this one: this one fills the width and doesn't end a sentence. */
function runsOn(previous: string, line: string, width: number): boolean {
  if (/[a-z]-$/.test(previous) && /^\p{Ll}/u.test(line)) return true
  if (/[.!?:;]["”’)]?$/.test(previous)) return /^\p{Ll}/u.test(line)
  return previous.length >= width * 0.7 || /^\p{Ll}/u.test(line)
}

/** Joins a run-on line, mending a word hyphenated across the break ("agree-" + "ment"). */
function joinLines(text: string, line: string): string {
  if (/\p{Ll}-$/u.test(text) && /^\p{Ll}/u.test(line)) return text.slice(0, -1) + line
  return `${text} ${line}`
}
