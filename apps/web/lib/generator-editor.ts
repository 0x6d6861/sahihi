import { type DocContent, DocContentSchema, type SignatureBlock } from "@sahihi/core"

/**
 * The bridge between a generated document's content (`DocContentSchema`, @sahihi/core) and the
 * rich-text editor (docs/ai-documents.md → Editing). The two trees are the same except for
 * signature blocks: the editor treats one as a single atomic node, so its caption and fields
 * travel in an `items` attribute instead of as children.
 */

interface EditorNode {
  type: string
  attrs?: Record<string, unknown>
  content?: EditorNode[]
  [key: string]: unknown
}

export function toEditorDoc(content: DocContent): EditorNode {
  return {
    type: "doc",
    content: content.content.map((section) => ({
      ...section,
      content: section.content.map((block) =>
        block.type === "signatureBlock"
          ? {
              type: "signatureBlock",
              attrs: { roleKey: block.attrs.roleKey, items: block.content },
            }
          : (block as unknown as EditorNode),
      ),
    })),
  }
}

/**
 * The editor's JSON back to stored content, validated. Throws (zod) when the editor produced
 * something the model doesn't allow, so it's never saved.
 */
export function fromEditorDoc(json: EditorNode): DocContent {
  return DocContentSchema.parse({
    type: "doc",
    content: (json.content ?? []).map((section) => ({
      ...section,
      content: (section.content ?? []).map((block) =>
        block.type === "signatureBlock"
          ? {
              type: "signatureBlock",
              attrs: { roleKey: block.attrs?.roleKey },
              content: block.attrs?.items as SignatureBlock["content"],
            }
          : block,
      ),
    })),
  })
}

/** A variable key for a new blank: the label in snake case, unique among `taken`. */
export function blankKey(label: string, taken: readonly string[]): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 40) || "blank"
  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`
  return key
}
