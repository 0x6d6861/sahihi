/**
 * Label colours and tags on folders and documents (ADR 0025). Pure helpers; the API owns the
 * queries. Like folders, labels are organisation only: no envelope, template or signing code reads
 * them.
 */

/**
 * The colour picker's starting swatches, named so the colour can be announced. Any other hex is
 * allowed too; these were the fixed palette before free colours (ADR 0025 amendment).
 */
export const LABEL_COLOR_PRESETS = [
  { name: "Red", color: "#D73337" },
  { name: "Orange", color: "#D35F00" },
  { name: "Yellow", color: "#C28F00" },
  { name: "Green", color: "#158F44" },
  { name: "Teal", color: "#008B86" },
  { name: "Blue", color: "#1570D1" },
  { name: "Purple", color: "#854ECE" },
  { name: "Pink", color: "#CD4290" },
  { name: "Gray", color: "#7A7A7A" },
] as const

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * A label colour as stored: `#RRGGBB` (or `#RRGGBBAA` below full opacity), uppercase. Accepts the
 * same with or without `#`; anything else is null.
 */
export function normalizeLabelColor(input: string): string | null {
  const match = HEX.exec(input.trim())
  if (!match?.[1]) return null
  const hex = match[1].toUpperCase()
  // Fully opaque alpha adds nothing.
  return `#${hex.length === 8 && hex.endsWith("FF") ? hex.slice(0, 6) : hex}`
}

/** "Blue" for a preset colour, else the hex itself, for screen readers and filter chips. */
export function labelColorName(color: string): string {
  const hex = normalizeLabelColor(color) ?? color
  return LABEL_COLOR_PRESETS.find((p) => p.color === hex)?.name ?? hex
}

/** Most tags one folder or document can carry. */
export const MAX_TAGS_PER_ITEM = 10

/** Longest tag name, in characters. */
export const MAX_TAG_LENGTH = 40

/** Trims a tag name and collapses inner whitespace ("  Q3   2026 " → "Q3 2026"). */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

/** What makes two tags the same tag in a workspace: the normalized name, lowercased. */
export function tagKey(name: string): string {
  return normalizeTagName(name).toLocaleLowerCase("en")
}

/**
 * Normalized tag names without blanks or case-insensitive duplicates. The first spelling wins
 * ("NDA", "nda" → "NDA"); order is kept.
 */
export function uniqueTags(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const name = normalizeTagName(raw)
    const key = tagKey(name)
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}
