import { z } from "zod"
import type {
  BlockNode,
  GeneratedDocumentData,
  InlineNode,
  Paragraph,
  Section,
  Variable,
} from "./model"
import { VariableSchema } from "./model"

/**
 * Blanks from an imported document's own text (docs/ai-documents.md → Import, ADR 0049). An
 * imported document arrives word for word, with names, dates and amounts written into it. The
 * assistant proposes which of those should be blanks (`propose_blanks`); accepting turns every
 * whole-word occurrence of each text into a blank whose value is that same text. The wording
 * doesn't change: the value moves into a blank the person can see and edit. Since the value comes
 * from the document, it needs no other evidence.
 */

const BlankText = z.string().trim().min(1).max(200)

export const ProposeBlanksInputSchema = z.object({
  blanks: z
    .array(
      VariableSchema.pick({ key: true, label: true, type: true, hint: true, party: true }).extend({
        /** The exact text in the document to turn into this blank (case and spelling as written). */
        text: BlankText,
      }),
    )
    .min(1)
    .max(30),
  rationale: z.string().trim().min(1).max(500),
})
export type ProposeBlanksInput = z.infer<typeof ProposeBlanksInputSchema>

/** What a stored `make_blanks` change holds: which text becomes which blank. */
export const MakeBlanksItemSchema = z.object({ text: BlankText, key: VariableSchema.shape.key })
export type MakeBlanksItem = z.infer<typeof MakeBlanksItemSchema>

/** `text` as a whole word or phrase: "Acme" must not match inside "Acmeville". */
function pattern(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu")
}

/** Text runs a blank can come from: the body, never signature blocks (signers are set elsewhere). */
function paragraphs(block: BlockNode): Paragraph[] {
  switch (block.type) {
    case "paragraph":
      return [block]
    case "bulletList":
    case "orderedList":
      return block.content.map((item) => item.content[0])
    case "table":
      return block.content.flatMap((row) => row.content.flatMap((cell) => cell.content))
    case "signatureBlock":
      return []
  }
}

/** How often `text` occurs as a whole word or phrase within one text node, across the body. */
export function countOccurrences(data: GeneratedDocumentData, text: string): number {
  const re = pattern(text)
  let n = 0
  for (const section of data.content.content) {
    for (const block of section.content) {
      for (const p of paragraphs(block)) {
        for (const node of p.content) {
          if (node.type === "text") n += node.text.match(re)?.length ?? 0
        }
      }
    }
  }
  return n
}

export type BuildBlanksResult =
  | { ok: true; items: MakeBlanksItem[]; variables: Variable[] }
  | { ok: false; error: string }

/**
 * Checks proposed blanks against the document: each text must be in it, keys must be new and
 * distinct, and no text may hold another (which one would win is unclear).
 */
export function buildBlanks(
  input: ProposeBlanksInput,
  data: GeneratedDocumentData,
): BuildBlanksResult {
  const taken = new Set(data.variables.map((v) => v.key))
  const keys = new Set<string>()
  for (const b of input.blanks) {
    if (taken.has(b.key) || keys.has(b.key)) {
      return { ok: false, error: `A blank called "${b.key}" already exists; pick another key.` }
    }
    keys.add(b.key)
    if (countOccurrences(data, b.text) === 0) {
      return {
        ok: false,
        error: `${JSON.stringify(b.text)} isn't in the document as written. Copy the text exactly.`,
      }
    }
  }
  for (const a of input.blanks) {
    const holder = input.blanks.find((b) => b !== a && pattern(a.text).test(b.text))
    if (holder) {
      return {
        ok: false,
        error: `${JSON.stringify(a.text)} is part of ${JSON.stringify(holder.text)}; propose only one of them.`,
      }
    }
  }
  return {
    ok: true,
    items: input.blanks.map((b) => ({ text: b.text, key: b.key })),
    variables: input.blanks.map((b) => ({
      key: b.key,
      label: b.label,
      type: b.type ?? "text",
      ...(b.hint ? { hint: b.hint } : {}),
      ...(b.party ? { party: true } : {}),
      value: b.text,
      status: "answered",
      source: "import",
    })),
  }
}

/** The text with every occurrence of each item's text replaced by its blank, marks kept. */
export function applyMakeBlanks(
  data: GeneratedDocumentData,
  items: readonly MakeBlanksItem[],
): GeneratedDocumentData {
  const swap = (nodes: InlineNode[]): InlineNode[] =>
    items.reduce<InlineNode[]>((acc, item) => acc.flatMap((node) => split(node, item)), nodes)
  const mapParagraph = (p: Paragraph): Paragraph => ({ ...p, content: swap(p.content) })
  const mapBlock = (block: BlockNode): BlockNode => {
    switch (block.type) {
      case "paragraph":
        return mapParagraph(block)
      case "bulletList":
      case "orderedList":
        return {
          ...block,
          content: block.content.map((item) => ({
            ...item,
            content: [mapParagraph(item.content[0])] as [Paragraph],
          })),
        }
      case "table":
        return {
          ...block,
          content: block.content.map((row) => ({
            ...row,
            content: row.content.map((cell) => ({
              ...cell,
              content: cell.content.map(mapParagraph),
            })),
          })),
        }
      case "signatureBlock":
        return block
    }
  }
  const sections: Section[] = data.content.content.map((s) => ({
    ...s,
    content: s.content.map(mapBlock),
  }))
  return { ...data, content: { ...data.content, content: sections } }
}

/** One text node split around each occurrence of `item.text`, which becomes the blank. */
function split(node: InlineNode, item: MakeBlanksItem): InlineNode[] {
  if (node.type !== "text") return [node]
  const re = pattern(item.text)
  const out: InlineNode[] = []
  const marks = node.marks ? { marks: node.marks } : {}
  let at = 0
  for (const m of node.text.matchAll(re)) {
    const start = m.index ?? 0
    if (start > at) out.push({ type: "text", text: node.text.slice(at, start), ...marks })
    out.push({ type: "variable", attrs: { key: item.key }, ...marks })
    at = start + m[0].length
  }
  if (at === 0) return [node]
  if (at < node.text.length) out.push({ type: "text", text: node.text.slice(at), ...marks })
  return out
}
