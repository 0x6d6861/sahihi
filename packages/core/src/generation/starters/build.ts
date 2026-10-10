import type {
  BlockNode,
  FieldNode,
  GeneratedFieldType,
  InlineNode,
  Paragraph,
  Section,
  SignerRole,
  Table,
  Variable,
} from "../model"

/** Builders the starters are written with: short so the wording stays readable. */

export const t = (text: string, bold = false): InlineNode =>
  bold ? { type: "text", text, marks: [{ type: "bold" }] } : { type: "text", text }

export const v = (key: string, bold = false): InlineNode =>
  bold
    ? { type: "variable", attrs: { key }, marks: [{ type: "bold" }] }
    : { type: "variable", attrs: { key } }

export const p = (...content: InlineNode[]): Paragraph => ({ type: "paragraph", content })

const list =
  (type: "orderedList" | "bulletList") =>
  (...items: InlineNode[][]): BlockNode => ({
    type,
    content: items.map((content) => ({ type: "listItem", content: [p(...content)] })),
  })
export const ol = list("orderedList")
export const ul = list("bulletList")

export const section = (id: string, title: string, ...content: BlockNode[]): Section => ({
  type: "section",
  attrs: { id, title, numbered: true },
  content,
})

/** A section without a number (a letter's opening, say). */
export const unnumbered = (id: string, title: string, ...content: BlockNode[]): Section => ({
  type: "section",
  attrs: { id, title, numbered: false },
  content,
})

/** A grid with a bold header row; each body row is a list of cells, each cell one paragraph. */
export const table = (header: string[], rows: InlineNode[][][]): Table => ({
  type: "table",
  content: [
    {
      type: "tableRow",
      content: header.map((h) => ({
        type: "tableHeader",
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [p(t(h))],
      })),
    },
    ...rows.map((cells) => ({
      type: "tableRow" as const,
      content: cells.map((c) => ({
        type: "tableCell" as const,
        attrs: { colspan: 1 as const, rowspan: 1 as const, colwidth: null },
        content: [p(...c)],
      })),
    })),
  ],
})

export const field = (id: string, fieldType: GeneratedFieldType, label?: string): FieldNode => ({
  type: "field",
  attrs: { id, fieldType, required: true, ...(label ? { label } : {}) },
})

export const blank = (
  key: string,
  label: string,
  type: Variable["type"],
  hint?: string,
): Variable => ({
  key,
  label,
  type,
  ...(hint ? { hint } : {}),
  value: null,
  status: "unresolved",
})

/** A blank that names a party: the Signers tab and the assistant match signers to it (ADR 0048). */
export const party = (key: string, label: string, hint?: string): Variable => ({
  ...blank(key, label, "text", hint),
  party: true,
})

export const role = (
  key: string,
  label: string,
  recipientRole: SignerRole["recipientRole"] = "SIGNER",
): SignerRole => ({
  key,
  label,
  recipientRole,
  name: null,
  email: null,
  initialsOnEveryPage: false,
})

/** Signature, name and date: what most signers fill in. */
export const standardFields = (roleKey: string): FieldNode[] => [
  field(`${roleKey}_signature`, "SIGNATURE", "Signature"),
  field(`${roleKey}_name`, "NAME", "Name"),
  field(`${roleKey}_date`, "DATE_SIGNED", "Date"),
]

/**
 * A signer's block. `intro` is what they sign to ("I accept this offer…"): it sits inside the block,
 * so a page break never separates it from the signature.
 */
export const signatureBlock = (
  roleKey: string,
  heading: InlineNode[],
  { intro, fields = standardFields(roleKey) }: { intro?: string; fields?: FieldNode[] } = {},
): BlockNode => ({
  type: "signatureBlock",
  attrs: { roleKey },
  content: [...(intro ? [p(t(intro))] : []), p(...heading), ...fields],
})
