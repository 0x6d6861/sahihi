/**
 * The assistant may only fill a blank with something the person actually said (docs/ai-documents.md
 * → Clarifying questions). `isValueAttested` checks a proposed value against everything the person
 * typed in this conversation: chat messages and question answers. It is deliberately literal
 * (case, spacing and surrounding punctuation aside): "Kenya" from "governed by Kenyan law" is
 * refused, and the assistant is told to ask instead.
 */

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'.,;:!?()]+|[\s"'.,;:!?()]+$/g, "")
}

export function isValueAttested(value: string, userTexts: readonly string[]): boolean {
  const v = normalize(value)
  if (!v) return false
  // Whole words only: "Kenya" must not match inside "Kenyan".
  const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u")
  return userTexts.some((t) => pattern.test(normalize(t)))
}
