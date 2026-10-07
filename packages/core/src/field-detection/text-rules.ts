import {
  clampRect,
  displayedSize,
  fromPdfRect,
  type NormalizedRect,
  type PageBox,
  type PdfRect,
} from "../geometry/coordinates"
import type { FieldType } from "../shared/enums"
import { ANCHOR_MIN_SIZE, type PageText, rangeBox } from "./anchor-tags"
import { type FieldSuggestion, readingOrder, withoutDuplicates } from "./field-suggestions"

/**
 * Text-layer rules for PDFs without anchor tags or a form (ADR 0020, tier 1c): a label
 * ("Signature", "By:", "Date") next to a signature line (underscores, dots or a drawn rule) becomes
 * a field on that line. The owner is guessed from the nearest party word in the same column
 * ("LANDLORD", or a term the contract defines like `(the "Company")`).
 *
 * Everything here works in normalized, displayed coordinates (docs/coordinates.md): x grows right,
 * y grows down, whatever the page's /Rotate.
 */

type LabelType = "SIGNATURE" | "INITIALS" | "DATE_SIGNED" | "NAME" | "EMAIL"

const LABEL_RE =
  /\b(?:(?<sig>authori[sz]ed\s+signature|signature|sign\s+here|signed)|(?<init>initials?)|(?<date>dated?)|(?<name>print(?:ed)?\s+name|full\s+name|name)|(?<email>e-?mail(?:\s+address)?)|(?<by>by(?=\s*:)))\b/gi

/** Blanks typed as text: underscores, dot leaders, ellipsis characters. */
const BLANK_RE = /_{4,}|\.{6,}|…{3,}/g

/** Party words that commonly head a signature block. Defined terms in the document are added. */
export const ROLE_WORDS = [
  "agent",
  "borrower",
  "buyer",
  "client",
  "company",
  "consultant",
  "contractor",
  "customer",
  "employee",
  "employer",
  "first party",
  "guarantor",
  "landlord",
  "lender",
  "lessee",
  "lessor",
  "licensee",
  "licensor",
  "owner",
  "party a",
  "party b",
  "purchaser",
  "second party",
  "seller",
  "service provider",
  "supplier",
  "tenant",
  "vendor",
  "witness",
] as const

// (the "Company"), ("Acme"), (hereinafter referred to as the "Tenant")
const DEFINED_TERM_RE =
  /\(\s*(?:hereinafter\s+(?:referred\s+to\s+as\s+|called\s+)?)?(?:the\s+)?["“']([A-Z][\w&.\- ]{1,30}?)["”']\s*\)/g

/** Field heights in points, by type. Widths come from the line. */
const FIELD_HEIGHT_PT: Record<LabelType, number> = {
  SIGNATURE: 36,
  INITIALS: 28,
  DATE_SIGNED: 18,
  NAME: 18,
  EMAIL: 18,
}
/** Thinnest and shortest drawn path that counts as a signature line, in points. */
const LINE_MAX_THICKNESS_PT = 3
const LINE_MIN_LENGTH_PT = 36
/** How far a line may start right of its label, and a party word may sit above, as page fractions. */
const MAX_LABEL_GAP = 0.4
const MAX_ROLE_DISTANCE = 0.2

/** Terms the text defines, lowercased: `(the "Landlord")` → "landlord". */
export function definedTerms(text: string): string[] {
  return [...text.matchAll(DEFINED_TERM_RE)].map((m) => (m[1] ?? "").trim().toLowerCase())
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function mentionRe(terms: Iterable<string>): RegExp {
  const all = [...new Set([...ROLE_WORDS, ...terms])].sort((a, b) => b.length - a.length)
  return new RegExp(`\\b(${all.map((t) => escapeRe(t).replace(/ /g, "\\s+")).join("|")})\\b`, "gi")
}

/** Capitalized mentions of party words ("Tenant", "LANDLORD"); lowercase ones are body text. */
function mentions(text: string, terms: Iterable<string>) {
  return [...text.matchAll(mentionRe(terms))]
    .filter((m) => /^[A-Z]/.test(m[0]))
    .map((m) => ({
      role: m[0].toLowerCase().replace(/\s+/g, " "),
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    }))
}

/** Longest row (characters) that still reads as a form row rather than running text. */
const MAX_LABEL_ROW = 60

/**
 * Label words that look like labels: followed by a colon, on a short row, or on a row with a blank.
 * "…pay rent by the due Date in each month…" is running text, not a label.
 */
function labels(text: string) {
  return [...text.matchAll(LABEL_RE)].flatMap((m) => {
    const g = m.groups ?? {}
    const type: LabelType =
      g.init !== undefined
        ? "INITIALS"
        : g.date !== undefined
          ? "DATE_SIGNED"
          : g.name !== undefined
            ? "NAME"
            : g.email !== undefined
              ? "EMAIL"
              : "SIGNATURE"
    const start = m.index ?? 0
    const end = start + m[0].length
    const rowStart = text.lastIndexOf("\n", start) + 1
    const nl = text.slice(end).search(/\r?\n/)
    const row = text.slice(rowStart, nl < 0 ? text.length : end + nl)
    const colon = /^\s*:/.test(text.slice(end, end + 10))
    if (!colon && row.trim().length > MAX_LABEL_ROW && !/_{4,}|\.{6,}|…{3,}/.test(row)) return []
    // "Date:" as the last text on its row: a blank the sender's template left invisible.
    const endsRow = /^\s*:[ \t]*(?:\r?\n|$)/.test(text.slice(end, end + 40))
    return [{ type, start, end, endsRow, text: m[0] }]
  })
}

/**
 * The [start, end) ranges whose glyph boxes the rules need (labels, blanks, party words), for
 * `readPageText`. A page with no drawn rules, no typed blanks and no "Label:" ending a row can't
 * produce a field, so nothing on it is measured: party words in body text are everywhere, and
 * measuring them all costs hundreds of MB on a long contract. Stateful: terms defined on earlier
 * pages are looked for on later ones.
 */
export function createTextRuleScanner(): (
  text: string,
  lines?: readonly PdfRect[],
) => [number, number][] {
  const terms = new Set<string>()
  return (text, lines = []) => {
    for (const t of definedTerms(text)) terms.add(t)
    const blanks = [...text.matchAll(BLANK_RE)]
    const found = labels(text)
    if (found.length === 0) return []
    if (lines.length === 0 && blanks.length === 0 && !found.some((l) => l.endsRow)) return []
    return [
      ...found.map((l) => [l.start, l.end] as [number, number]),
      ...blanks.map((m) => {
        const start = m.index ?? 0
        return [start, start + m[0].length] as [number, number]
      }),
      ...mentions(text, terms).map((m) => [m.start, m.end] as [number, number]),
    ]
  }
}

/** A horizontal line: x span and its vertical position, normalized. */
interface Line {
  x: number
  y: number
  width: number
}

const bottom = (r: NormalizedRect) => r.y + r.height
const right = (r: { x: number; width: number }) => r.x + r.width

/** Labels paired with the signature lines on their page, then turned into suggestions. */
export function suggestFieldsFromText(
  pages: PageText[],
  boxes: PageBox[],
): { suggestions: FieldSuggestion[] } {
  const terms = new Set(pages.flatMap((p) => definedTerms(p.text)))
  const suggestions: FieldSuggestion[] = []

  for (const p of pages) {
    const page = boxes[p.page - 1]
    if (!page) continue
    const shown = displayedSize(page)
    const ptX = (v: number) => v / shown.width
    const ptY = (v: number) => v / shown.height
    const norm = (r: PdfRect | null) => (r ? fromPdfRect(r, page) : null)

    const lines: Line[] = []
    for (const m of p.text.matchAll(BLANK_RE)) {
      const start = m.index ?? 0
      const r = norm(rangeBox(p.boxes, start, start + m[0].length))
      if (r) lines.push({ x: r.x, y: bottom(r), width: r.width })
    }
    for (const l of p.lines ?? []) {
      const r = fromPdfRect(l, page)
      if (r.height <= ptY(LINE_MAX_THICKNESS_PT) && r.width >= ptX(LINE_MIN_LENGTH_PT))
        lines.push({ x: r.x, y: r.y + r.height / 2, width: r.width })
    }

    const found = labels(p.text).flatMap((l) => {
      const rect = norm(rangeBox(p.boxes, l.start, l.end))
      return rect ? [{ ...l, rect, used: false }] : []
    })
    const parties = mentions(p.text, terms).flatMap((m) => {
      const rect = norm(rangeBox(p.boxes, m.start, m.end))
      return rect ? [{ role: m.role, rect }] : []
    })
    if (found.length === 0) continue

    const placed: { label: (typeof found)[number]; field: NormalizedRect }[] = []
    const onLine = (label: (typeof found)[number], line: Line) => {
      label.used = true
      const height = ptY(FIELD_HEIGHT_PT[label.type])
      placed.push({ label, field: { x: line.x, y: line.y - height, width: line.width, height } })
    }

    // 1. A line to the right of a label on the same row ("Signature: ______"). The nearest label
    //    wins, so "Signature Date: ____" is a date.
    const free: Line[] = []
    for (const line of lines) {
      const sameRow = found.filter((l) => {
        const h = l.rect.height
        return (
          !l.used &&
          line.y >= l.rect.y + 0.25 * h &&
          line.y <= bottom(l.rect) + 0.6 * h &&
          line.x >= right(l.rect) - ptX(2) &&
          line.x - right(l.rect) <= MAX_LABEL_GAP
        )
      })
      const label = sameRow.sort((a, b) => right(b.rect) - right(a.rect))[0]
      if (label) onLine(label, line)
      else free.push(line)
    }
    // 2. A line just above a label ("______" over "Signature").
    for (const line of free) {
      const below = found.filter((l) => {
        const gap = l.rect.y - line.y
        return (
          !l.used &&
          gap >= -ptY(1) &&
          gap <= 2 * l.rect.height + ptY(4) &&
          l.rect.x >= line.x - ptX(6) &&
          l.rect.x <= right(line)
        )
      })
      const label = below.sort((a, b) => a.rect.y - b.rect.y)[0]
      if (label) onLine(label, line)
    }
    // 3. "Date:" ending its row with no line: a field right after the label.
    for (const label of found) {
      if (label.used || !label.endsRow) continue
      const height = ptY(FIELD_HEIGHT_PT[label.type])
      placed.push({
        label,
        field: {
          x: right(label.rect) + ptX(4),
          y: bottom(label.rect) - height,
          width: ptX(ANCHOR_MIN_SIZE[label.type].width),
          height,
        },
      })
    }

    for (const { label, field } of placed) {
      const f = clampRect(field)
      suggestions.push({
        ...f,
        type: label.type as FieldType,
        page: p.page,
        required: true,
        roleHint: nearestParty(parties, label.rect, f),
        source: "text",
        sourceName: label.text,
      })
    }
  }
  return { suggestions: withoutDuplicates([], suggestions).sort(readingOrder) }
}

/**
 * The party a field belongs to: a party word on the label's row to its left ("Tenant signature:"),
 * else the nearest one above the label and field, in the same column.
 */
function nearestParty(
  parties: { role: string; rect: NormalizedRect }[],
  label: NormalizedRect,
  field: NormalizedRect,
): string | null {
  const sameRow = parties
    .filter(
      (m) =>
        m.rect.y < bottom(label) && bottom(m.rect) > label.y && right(m.rect) <= label.x + 1e-3,
    )
    .sort((a, b) => right(b.rect) - right(a.rect))
  if (sameRow[0]) return sameRow[0].role

  const top = Math.min(label.y, field.y)
  const left = Math.min(label.x, field.x)
  const end = Math.max(right(label), right(field))
  const above = parties
    .filter((m) => {
      const gap = top - bottom(m.rect)
      return (
        gap >= -1e-3 && gap <= MAX_ROLE_DISTANCE && m.rect.x < end && right(m.rect) > left - 0.02
      )
    })
    .sort((a, b) => bottom(b.rect) - bottom(a.rect))
  return above[0]?.role ?? null
}
