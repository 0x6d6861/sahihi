import type { NormalizedRect } from "../geometry/coordinates"
import type { FieldType } from "../shared/enums"

/**
 * Detected fields the sender reviews in the placement editor before anything is saved (ADR 0020).
 * Detectors: `anchor-tags.ts` (`{{s1:signature}}`), `form-fields.ts` (the PDF's own AcroForm) and
 * `text-rules.ts` (labels next to signature lines).
 */
export interface FieldSuggestion extends NormalizedRect {
  type: FieldType
  /** 1-based */
  page: number
  required: boolean
  /** Who the field seems to belong to ("buyer", "s1"). Null if unknown. */
  roleHint: string | null
  source: "anchor" | "form" | "text"
  /** The anchor text, form field name or label, for display. */
  sourceName: string
}

/** Above this intersection-over-union two rects on the same page count as the same field. */
export const DUPLICATE_IOU = 0.5

/** Intersection over union of two rects, 0 (apart) to 1 (identical). */
export function iou(a: NormalizedRect, b: NormalizedRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  return inter / (a.width * a.height + b.width * b.height - inter)
}

type Placed = NormalizedRect & { page: number }

/** The incoming fields that don't sit on top of an existing field or an earlier incoming one. */
export function withoutDuplicates<F extends Placed>(existing: Placed[], incoming: F[]): F[] {
  const kept: F[] = []
  for (const f of incoming) {
    const dup = [...existing, ...kept].some((g) => g.page === f.page && iou(g, f) > DUPLICATE_IOU)
    if (!dup) kept.push(f)
  }
  return kept
}

/** Page, then top to bottom, then left to right. */
export const readingOrder = (a: Placed, b: Placed) => a.page - b.page || a.y - b.y || a.x - b.x

/**
 * Several detectors' results as one list in reading order. Earlier lists win where two overlap,
 * so pass the most deliberate source first (anchor tags, then form fields, then text rules).
 */
export function mergeSuggestions(...lists: FieldSuggestion[][]): FieldSuggestion[] {
  return withoutDuplicates([], lists.flat()).sort(readingOrder)
}

/** `s2`, `signer 2`, `signer2`, `party 2`, `2` → 2. */
export function roleNumber(role: string): number | null {
  const m = /^(?:s|signer|recipient|party)?\s?(\d{1,2})$/i.exec(role.trim())
  const n = m ? Number(m[1]) : 0
  return n >= 1 ? n : null
}

/**
 * Recipient for each suggestion.
 * - Numbered roles (`s1`, `signer2`) go to that position in the recipient list.
 * - Otherwise distinct roles, in reading order, go to the recipients in list order
 *   ("seller" → 1st, "buyer" → 2nd), but only when there are at least two roles: one role says
 *   nothing about who it is.
 * Fields without a role, and roles beyond the recipient list, go to `fallbackId` (the active
 * recipient).
 */
export function assignSuggestions(
  suggestions: Pick<FieldSuggestion, "roleHint">[],
  recipientIds: string[],
  fallbackId: string,
): string[] {
  const roles: string[] = []
  for (const s of suggestions) if (s.roleHint && !roles.includes(s.roleHint)) roles.push(s.roleHint)
  const numbered = roles.length > 0 && roles.every((r) => roleNumber(r) !== null)
  if (!numbered && roles.length < 2) return suggestions.map(() => fallbackId)
  return suggestions.map((s) => {
    if (!s.roleHint) return fallbackId
    const i = numbered ? (roleNumber(s.roleHint) ?? 0) - 1 : roles.indexOf(s.roleHint)
    return recipientIds[i] ?? fallbackId
  })
}
