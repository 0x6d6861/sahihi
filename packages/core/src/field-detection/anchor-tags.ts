import {
  clampRect,
  displayedSize,
  fromPdfRect,
  type PageBox,
  type PdfRect,
} from "../geometry/coordinates"
import type { FieldType } from "../shared/enums"
import { type FieldSuggestion, readingOrder } from "./field-suggestions"

/**
 * Anchor tags: text like `{{s1:signature}}` typed into the source document marks where a field
 * goes and who fills it. Found on the PDF's text layer (`@sahihi/pdf#readPageText`). See
 * docs/pdf-pipeline.md → Field detection and ADR 0020.
 *
 *   {{<role>:<type>}}            {{s1:signature}}  {{buyer:date}}
 *   {{<role>:<type>:optional}}   {{s2:checkbox:required}}
 */

/**
 * One page's text, one UTF-16 code unit per PDF character, plus PDF-space glyph boxes keyed by
 * index. Boxes are sparse: the reader only measures the ranges it was asked for (`anchorRanges`),
 * and characters PDFium generates itself (spaces, line breaks) never have one.
 */
export interface PageText {
  /** 1-based */
  page: number
  text: string
  boxes: ReadonlyMap<number, PdfRect>
  /** Bounds of thin horizontal drawn paths (signature lines), when the reader was asked for them. */
  lines?: PdfRect[]
}

const TYPE_ALIASES: Record<string, FieldType> = {
  signature: "SIGNATURE",
  sig: "SIGNATURE",
  sign: "SIGNATURE",
  initials: "INITIALS",
  initial: "INITIALS",
  init: "INITIALS",
  date: "DATE_SIGNED",
  name: "NAME",
  email: "EMAIL",
  text: "TEXT",
  checkbox: "CHECKBOX",
  check: "CHECKBOX",
}

/**
 * Smallest field per type, in points (1/72 in). An anchor is usually set in small or white text,
 * so the field grows from the anchor's bottom-left corner up and to the right to at least this
 * size, sitting on the same line as the tag.
 */
export const ANCHOR_MIN_SIZE: Record<FieldType, { width: number; height: number }> = {
  SIGNATURE: { width: 160, height: 40 },
  INITIALS: { width: 60, height: 30 },
  DATE_SIGNED: { width: 100, height: 20 },
  NAME: { width: 160, height: 20 },
  EMAIL: { width: 180, height: 20 },
  TEXT: { width: 160, height: 20 },
  CHECKBOX: { width: 14, height: 14 },
}

// Whitespace is allowed anywhere inside: text extraction inserts spaces around kerned glyphs.
const ANCHOR_RE = /\{\{\s*([A-Za-z0-9_-]{1,32})\s*:\s*([A-Za-z]+)\s*(?::\s*([A-Za-z]+)\s*)?\}\}/g

export interface AnchorTag {
  role: string
  type: FieldType
  required: boolean
  /** Code-unit offsets into the page text. */
  start: number
  end: number
}

/** Every well-formed anchor in a text. Unknown types or options count as `invalid`. */
export function parseAnchorTags(text: string): { tags: AnchorTag[]; invalid: number } {
  const tags: AnchorTag[] = []
  let invalid = 0
  for (const m of text.matchAll(ANCHOR_RE)) {
    const [whole, role = "", rawType = "", option] = m
    const type = TYPE_ALIASES[rawType.toLowerCase()]
    const opt = option?.toLowerCase()
    if (!type || (opt && opt !== "optional" && opt !== "required")) {
      invalid++
      continue
    }
    const start = m.index ?? 0
    tags.push({
      role: role.toLowerCase(),
      type,
      required: opt ? opt === "required" : type !== "CHECKBOX",
      start,
      end: start + whole.length,
    })
  }
  return { tags, invalid }
}

/** The [start, end) ranges whose glyph boxes `suggestFieldsFromAnchors` needs. */
export function anchorRanges(text: string): [number, number][] {
  if (!text.includes("{{")) return []
  return parseAnchorTags(text).tags.map((t) => [t.start, t.end])
}

/** Bounding box of the glyphs in [start, end). Null if none of them has a box. */
export function rangeBox(
  boxes: ReadonlyMap<number, PdfRect>,
  start: number,
  end: number,
): PdfRect | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = start; i < end; i++) {
    const b = boxes.get(i)
    if (!b || b.width <= 0 || b.height <= 0) continue
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.width)
    y1 = Math.max(y1, b.y + b.height)
  }
  return x0 < x1 && y0 < y1 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
}

/** Anchor tags on every page → suggestions in reading order. Tags without glyph boxes are `skipped`. */
export function suggestFieldsFromAnchors(
  pages: PageText[],
  boxes: PageBox[],
): { suggestions: FieldSuggestion[]; skipped: number } {
  const suggestions: FieldSuggestion[] = []
  let skipped = 0
  for (const p of pages) {
    const page = boxes[p.page - 1]
    const { tags, invalid } = parseAnchorTags(p.text)
    skipped += invalid
    for (const tag of tags) {
      const box = page && rangeBox(p.boxes, tag.start, tag.end)
      if (!page || !box) {
        skipped++
        continue
      }
      const anchor = fromPdfRect(box, page)
      const shown = displayedSize(page)
      const min = ANCHOR_MIN_SIZE[tag.type]
      const width = Math.max(anchor.width, min.width / shown.width)
      const height = Math.max(anchor.height, min.height / shown.height)
      suggestions.push({
        ...clampRect({ x: anchor.x, y: anchor.y + anchor.height - height, width, height }),
        type: tag.type,
        page: p.page,
        required: tag.required,
        roleHint: tag.role,
        source: "anchor",
        sourceName: p.text.slice(tag.start, tag.end),
      })
    }
  }
  suggestions.sort(readingOrder)
  return { suggestions, skipped }
}
