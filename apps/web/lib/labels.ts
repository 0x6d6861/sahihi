/**
 * Tags on folders and documents (ADR 0025), for the web. Colours are free hex (`LabelColorSchema`,
 * `labelColorName` in `@sahihi/core`).
 */
export interface TagRef {
  id: string
  name: string
}

/** Tag names that match `query` (case-insensitive) and aren't chosen yet, for the tag picker. */
export function tagSuggestions(
  all: readonly string[],
  chosen: readonly string[],
  query: string,
): string[] {
  const q = query.trim().toLowerCase()
  const taken = new Set(chosen.map((t) => t.toLowerCase()))
  return all.filter((t) => !taken.has(t.toLowerCase()) && t.toLowerCase().includes(q))
}
