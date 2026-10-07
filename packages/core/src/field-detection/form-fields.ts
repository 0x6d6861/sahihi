import {
  fromPdfRect,
  isValidRect,
  type NormalizedRect,
  type PageBox,
  type PdfRect,
} from "../geometry/coordinates"
import type { FieldType } from "../shared/enums"
import { type FieldSuggestion, readingOrder } from "./field-suggestions"

/**
 * Turn a PDF's own form widgets (AcroForm) into field suggestions for the placement editor.
 * Pure: `@sahihi/pdf#readFormWidgets` does the parsing. The sender reviews every suggestion in the
 * editor before anything is saved (ADR 0020).
 */

/** AcroForm field kinds we read. Anything else (buttons, radios, lists) is skipped. */
export type FormWidgetKind = "signature" | "text" | "checkbox" | "other"

export interface FormWidget {
  kind: FormWidgetKind
  /** Fully qualified field name, e.g. `form1[0].Page1[0].Buyer_Signature[0]`. */
  name: string
  /** 1-based */
  page: number
  /** The widget's /Rect in unrotated PDF user space. May be unnormalized (negative size). */
  rect: PdfRect
}

/** Below this size (page fractions) a widget is treated as hidden. */
const MIN_SIZE = 0.005

// Words that describe the field's type, not who fills it. Removed before reading a role hint.
const TYPE_WORDS = new Set([
  "box",
  "by",
  "cb",
  "check",
  "checkbox",
  "date",
  "dated",
  "e",
  "email",
  "field",
  "full",
  "here",
  "init",
  "initial",
  "initials",
  "line",
  "mail",
  "name",
  "of",
  "print",
  "printed",
  "s",
  "sig",
  "sign",
  "signature",
  "signed",
  "text",
  "the",
  "txt",
])

/** Last segment of a qualified name, split into lowercase words. `Buyer_SignDate[0]` → buyer, sign, date. */
export function nameTokens(name: string): string[] {
  const last = name.split(".").pop() ?? ""
  return last
    .replace(/\[\d+\]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** The field type a widget maps to, or null if we don't support it. */
export function fieldTypeForWidget(kind: FormWidgetKind, name: string): FieldType | null {
  if (kind === "signature") return "SIGNATURE"
  if (kind === "checkbox") return "CHECKBOX"
  if (kind !== "text") return null
  // Compare without trailing digits so "Signature1" and "Date_2" still count.
  const words = new Set(nameTokens(name).map((t) => t.replace(/\d+$/, "")))
  const has = (...w: string[]) => w.some((x) => words.has(x))
  if (has("date", "dated")) return "DATE_SIGNED"
  if (has("email", "mail")) return "EMAIL"
  if (has("initial", "initials", "init")) return "INITIALS"
  if (has("name") && has("print", "printed", "full")) return "NAME"
  if (has("signature", "sign", "sig", "signed")) return "SIGNATURE"
  if (has("name")) return "NAME"
  return "TEXT"
}

/** Who a field seems to belong to: its name minus type words and bare numbers. */
export function roleHint(name: string): string | null {
  const words = nameTokens(name).filter((t) => {
    if (/^\d+$/.test(t)) return false
    return !TYPE_WORDS.has(t.replace(/\d+$/, ""))
  })
  return words.length ? words.join(" ") : null
}

/** A widget rect → normalized rect cropped to the page, or null if it's (nearly) off-page or empty. */
function widgetRect(rect: PdfRect, page: PageBox): NormalizedRect | null {
  const pdf: PdfRect = {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  }
  const n = fromPdfRect(pdf, page)
  const x0 = Math.max(0, n.x)
  const y0 = Math.max(0, n.y)
  const x1 = Math.min(1, n.x + n.width)
  const y1 = Math.min(1, n.y + n.height)
  if (x1 - x0 < MIN_SIZE || y1 - y0 < MIN_SIZE) return null
  const r = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  return isValidRect(r) ? r : null
}

/**
 * Widgets → suggestions in reading order (page, then top to bottom, then left to right).
 * Unsupported kinds, unknown pages and hidden or off-page widgets are counted in `skipped`.
 */
export function suggestFieldsFromForm(
  widgets: FormWidget[],
  pages: PageBox[],
): { suggestions: FieldSuggestion[]; skipped: number } {
  const suggestions: FieldSuggestion[] = []
  let skipped = 0
  for (const w of widgets) {
    const type = fieldTypeForWidget(w.kind, w.name)
    const page = pages[w.page - 1]
    const rect = type && page ? widgetRect(w.rect, page) : null
    if (!type || !rect) {
      skipped++
      continue
    }
    suggestions.push({
      ...rect,
      type,
      page: w.page,
      required: type !== "CHECKBOX",
      roleHint: roleHint(w.name),
      source: "form",
      sourceName: w.name,
    })
  }
  suggestions.sort(readingOrder)
  return { suggestions, skipped }
}
