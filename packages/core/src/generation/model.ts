import { z } from "zod"

/**
 * AI-generated documents (docs/ai-documents.md): the structured source a document is drafted in,
 * before it's rendered to a PDF and handed to the signing pipeline.
 *
 * The tree is ProseMirror-compatible JSON (`type`, `attrs`, `content`, `marks`) so a rich-text
 * editor can load it as is. Section numbers are never stored: they follow from the order
 * (`numberSections`). Values never sit in the text: a `variable` node points at a key in
 * `variables`, and signature fields belong to a signer role in `roles`, so the body and the signer
 * list can't disagree.
 */

const Key = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,47}$/, "Use lowercase letters, digits and underscores")
const NodeId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

// ── Inline ───────────────────────────────────────────────────────────────────
export const MARK_TYPES = ["bold", "italic", "underline"] as const
export type MarkType = (typeof MARK_TYPES)[number]

export const TextNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(10_000),
  marks: z
    .array(z.object({ type: z.enum(MARK_TYPES) }))
    .max(3)
    .optional(),
})
export type TextNode = z.infer<typeof TextNodeSchema>

/** A blank in the text, filled from `variables[key]`. Atomic: it can't be edited as text. */
export const VariableNodeSchema = z.object({
  type: z.literal("variable"),
  attrs: z.object({ key: Key }),
  marks: TextNodeSchema.shape.marks,
})
export type VariableNode = z.infer<typeof VariableNodeSchema>

export const InlineNodeSchema = z.discriminatedUnion("type", [TextNodeSchema, VariableNodeSchema])
export type InlineNode = z.infer<typeof InlineNodeSchema>

export const ParagraphSchema = z.object({
  type: z.literal("paragraph"),
  content: z.array(InlineNodeSchema).max(500).default([]),
})
export type Paragraph = z.infer<typeof ParagraphSchema>

// ── Blocks ───────────────────────────────────────────────────────────────────
const ListItemSchema = z.object({
  type: z.literal("listItem"),
  content: z.tuple([ParagraphSchema]),
})

export const ListSchema = z.object({
  type: z.enum(["bulletList", "orderedList"]),
  content: z.array(ListItemSchema).min(1).max(100),
})
export type List = z.infer<typeof ListSchema>

/**
 * A plain grid: every row has the same number of cells (`structureIssues` checks), no merged cells.
 * `tableHeader` cells render bold. Rows never split across pages.
 */
const TableCellSchema = z.object({
  type: z.enum(["tableCell", "tableHeader"]),
  attrs: z
    .object({
      colspan: z.literal(1).default(1),
      rowspan: z.literal(1).default(1),
      colwidth: z.array(z.number()).nullable().default(null),
    })
    .default({ colspan: 1, rowspan: 1, colwidth: null }),
  content: z.array(ParagraphSchema).min(1).max(20),
})
export type TableCell = z.infer<typeof TableCellSchema>

export const TableSchema = z.object({
  type: z.literal("table"),
  content: z
    .array(
      z.object({
        type: z.literal("tableRow"),
        content: z.array(TableCellSchema).min(1).max(12),
      }),
    )
    .min(1)
    .max(200),
})
export type Table = z.infer<typeof TableSchema>

/** Field kinds a generated document can place; each maps 1:1 to the envelope `FieldType`. */
export const GENERATED_FIELD_TYPES = [
  "SIGNATURE",
  "INITIALS",
  "NAME",
  "DATE_SIGNED",
  "TEXT",
  "CHECKBOX",
] as const
export type GeneratedFieldType = (typeof GENERATED_FIELD_TYPES)[number]

export const FieldNodeSchema = z.object({
  type: z.literal("field"),
  attrs: z.object({
    id: NodeId,
    fieldType: z.enum(GENERATED_FIELD_TYPES),
    required: z.boolean().default(true),
    label: z.string().trim().max(80).optional(),
  }),
})
export type FieldNode = z.infer<typeof FieldNodeSchema>

/**
 * Where one signer role signs: optional caption paragraphs (e.g. "For {party_a_name}") and the
 * role's fields, stacked. The renderer never splits a block across pages.
 */
export const SignatureBlockSchema = z.object({
  type: z.literal("signatureBlock"),
  attrs: z.object({ roleKey: Key }),
  content: z
    .array(z.discriminatedUnion("type", [ParagraphSchema, FieldNodeSchema]))
    .min(1)
    .max(12),
})
export type SignatureBlock = z.infer<typeof SignatureBlockSchema>

export const BlockNodeSchema = z.discriminatedUnion("type", [
  ParagraphSchema,
  ListSchema,
  TableSchema,
  SignatureBlockSchema,
])
export type BlockNode = z.infer<typeof BlockNodeSchema>

/** A numbered clause. `id` is stable across versions, so chat and edits can point at it. */
export const SectionSchema = z.object({
  type: z.literal("section"),
  attrs: z.object({
    id: NodeId,
    title: z.string().trim().min(1).max(200),
    /** Unnumbered sections (a preamble, the signature page) don't count towards numbering. */
    numbered: z.boolean().default(true),
  }),
  content: z.array(BlockNodeSchema).max(200),
})
export type Section = z.infer<typeof SectionSchema>

export const DocContentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(SectionSchema).min(1).max(200),
})
export type DocContent = z.infer<typeof DocContentSchema>

// ── Data next to the tree ────────────────────────────────────────────────────
export const VARIABLE_TYPES = [
  "text",
  "date",
  "duration",
  "amount",
  "address",
  "jurisdiction",
] as const
export type VariableType = (typeof VARIABLE_TYPES)[number]

export const VARIABLE_STATUSES = ["unresolved", "answered", "skipped"] as const
export type VariableStatus = (typeof VARIABLE_STATUSES)[number]

/** Where a value came from: a question answer, the user's chat message, or a direct edit. */
export const VALUE_SOURCES = ["answer", "chat", "edit"] as const
export type ValueSource = (typeof VALUE_SOURCES)[number]

export const VariableValueSchema = z.string().trim().min(1).max(500)

export const VariableSchema = z.object({
  key: Key,
  label: z.string().trim().min(1).max(120),
  type: z.enum(VARIABLE_TYPES).default("text"),
  /** Extra guidance for the assistant and the person answering ("Full registered name"). */
  hint: z.string().trim().max(200).optional(),
  value: VariableValueSchema.nullable().default(null),
  status: z.enum(VARIABLE_STATUSES).default("unresolved"),
  source: z.enum(VALUE_SOURCES).optional(),
})
export type Variable = z.infer<typeof VariableSchema>

/** Generated documents use signers and viewers (CC); approvers stay an envelope-editor feature. */
export const SIGNER_ROLE_KINDS = ["SIGNER", "VIEWER"] as const

export const SignerRoleSchema = z.object({
  key: Key,
  /** What the slot is called ("Party A", "Employee"). */
  label: z.string().trim().min(1).max(60),
  recipientRole: z.enum(SIGNER_ROLE_KINDS).default("SIGNER"),
  /** Contact of the person who signs. Comes from the Signers tab, never from the body text. */
  name: z.string().trim().max(120).nullable().default(null),
  email: z.string().trim().toLowerCase().max(254).nullable().default(null),
  /** Signers only: an initials field in the bottom margin of every page (placed by the renderer). */
  initialsOnEveryPage: z.boolean().default(false),
})
export type SignerRole = z.infer<typeof SignerRoleSchema>

export const PAGE_SIZES = ["A4", "LETTER"] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const GeneratedDocumentDataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  pageSize: z.enum(PAGE_SIZES).default("A4"),
  content: DocContentSchema,
  variables: z.array(VariableSchema).max(200),
  roles: z.array(SignerRoleSchema).min(1).max(20),
})
/** Everything one version holds. Versions are immutable: every change makes a new one. */
export type GeneratedDocumentData = z.infer<typeof GeneratedDocumentDataSchema>

export const GENERATED_DOCUMENT_STATUSES = ["DRAFT", "FINALIZED"] as const
export type GeneratedDocumentStatus = (typeof GENERATED_DOCUMENT_STATUSES)[number]

export const GENERATION_ACTORS = ["USER", "AI"] as const
export type GenerationActor = (typeof GENERATION_ACTORS)[number]

/** `GeneratedDocumentEvent.type`: what happened to a generated document, and by whom. */
export const GENERATION_EVENT_TYPES = [
  "document.created",
  /** The person answered or skipped questions, or edited blanks directly. */
  "variables.updated",
  /** The assistant filled blanks from what the person said in the chat. */
  "variables.set_by_assistant",
  /** The assistant tried to fill a blank with something the person never said; refused. */
  "variables.rejected",
  "roles.updated",
  /** The person edited the text in the editor (and maybe added blanks). */
  "content.updated",
  /** The assistant proposed an edit; the person accepted or rejected it. */
  "proposal.created",
  "proposal.accepted",
  "proposal.rejected",
  /** A proposal was refused before reaching the person (invented specifics, unknown blank…). */
  "proposal.refused",
  /** One assistant reply: model and token usage, never the prompt or the text. */
  "assistant.turn",
  "document.finalized",
] as const
export type GenerationEventType = (typeof GENERATION_EVENT_TYPES)[number]
