import { z } from "zod"
import { inlineText, structureIssues } from "./document"
import {
  type BlockNode,
  type GeneratedDocumentData,
  GeneratedDocumentDataSchema,
  type InlineNode,
  type MarkType,
  type Section,
  SectionSchema,
  SignerRoleSchema,
  type Variable,
  VariableSchema,
} from "./model"
import { isValueAttested } from "./provenance"
import {
  applySigners,
  currentSigners,
  SignerFieldSchema,
  SignersDefinitionSchema,
  SignersError,
  signersText,
} from "./signers"

/**
 * Assistant edit proposals (docs/ai-documents.md → Proposals, ADR 0044). The assistant never edits
 * the text: it proposes a change to a section (replace, delete) or new sections, and the person
 * accepts or rejects it. Accepting applies the change to the latest version, unless the section it
 * was about changed meanwhile (then it's out of date).
 *
 * The assistant writes sections in a small text format rather than editor JSON: paragraphs and
 * lists of strings, where `{{key}}` is a blank, `**x**` bold and `*x*` italic.
 */

export const PROPOSAL_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "STALE"] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

// ── What the assistant sends ─────────────────────────────────────────────────
const DraftText = z.string().trim().min(1).max(4000)

const DraftBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: DraftText }),
  z.object({
    type: z.literal("list"),
    /** Lettered (a), (b)… when true; bullets otherwise. */
    ordered: z.boolean().default(true),
    items: z.array(DraftText).min(1).max(30),
  }),
])

export const DraftSectionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  blocks: z.array(DraftBlockSchema).min(1).max(40),
})
export type DraftSection = z.infer<typeof DraftSectionSchema>

/** Blanks a proposal introduces: the person fills them later, like any other. */
const NewBlankSchema = VariableSchema.pick({ key: true, label: true, type: true, hint: true })

const Rationale = z.string().trim().min(1).max(500)
const SectionIdRef = z.string().min(1).max(64)

export const ProposeSectionEditInputSchema = z
  .object({
    sectionId: SectionIdRef,
    operation: z.enum(["replace", "delete"]),
    /** The section's new title and text (replace only). */
    section: DraftSectionSchema.optional(),
    newBlanks: z.array(NewBlankSchema).max(10).default([]),
    rationale: Rationale,
  })
  .refine((v) => v.operation === "delete" || v.section, {
    message: "A replacement needs the new section",
    path: ["section"],
  })
export type ProposeSectionEditInput = z.infer<typeof ProposeSectionEditInputSchema>

export const ProposeSectionsInputSchema = z.object({
  /** Insert after this section; null = at the start. */
  afterSectionId: SectionIdRef.nullable(),
  sections: z.array(DraftSectionSchema).min(1).max(10),
  newBlanks: z.array(NewBlankSchema).max(10).default([]),
  rationale: Rationale,
})
export type ProposeSectionsInput = z.infer<typeof ProposeSectionsInputSchema>

/**
 * Who signs and where. Contacts are optional: left out, an existing role keeps its contact; given,
 * they must be something the person said.
 */
export const DefineSignersInputSchema = z.object({
  roles: z
    .array(
      SignerRoleSchema.pick({ key: true, label: true, recipientRole: true }).extend({
        initialsOnEveryPage: z.boolean().default(false),
        name: z.string().trim().min(1).max(120).optional(),
        email: z.string().trim().toLowerCase().max(254).optional(),
      }),
    )
    .min(1)
    .max(20),
  fields: z.record(z.string(), z.array(SignerFieldSchema.omit({ id: true })).max(12)).default({}),
  rationale: Rationale,
})
export type DefineSignersInput = z.infer<typeof DefineSignersInputSchema>

// ── What is stored ───────────────────────────────────────────────────────────
export const ProposalChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("replace_section"), sectionId: z.string(), section: SectionSchema }),
  z.object({ kind: z.literal("delete_section"), sectionId: z.string() }),
  z.object({
    kind: z.literal("insert_sections"),
    afterSectionId: z.string().nullable(),
    sections: z.array(SectionSchema).min(1),
  }),
  z.object({ kind: z.literal("set_signers"), signers: SignersDefinitionSchema }),
])
export type ProposalChange = z.infer<typeof ProposalChangeSchema>

export const ProposalPayloadSchema = z.object({
  change: ProposalChangeSchema,
  newVariables: z.array(VariableSchema).default([]),
})
export type ProposalPayload = z.infer<typeof ProposalPayloadSchema>

// ── Draft text → document nodes ──────────────────────────────────────────────
const TOKEN = /(\{\{[a-z][a-z0-9_]*\}\}|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g

/** `{{key}}` → blank, `**x**` → bold, `*x*` → italic; everything else is text. */
export function draftInline(text: string, marks: MarkType[] = []): InlineNode[] {
  const withMarks = marks.length ? { marks: marks.map((type) => ({ type })) } : {}
  const out: InlineNode[] = []
  for (const part of text.split(TOKEN)) {
    if (!part) continue
    const blank = /^\{\{([a-z][a-z0-9_]*)\}\}$/.exec(part)
    if (blank?.[1]) out.push({ type: "variable", attrs: { key: blank[1] }, ...withMarks })
    else if (/^\*\*[^*]+\*\*$/.test(part))
      out.push(...draftInline(part.slice(2, -2), [...marks, "bold"]))
    else if (/^\*[^*\s][^*]*\*$/.test(part)) {
      out.push(...draftInline(part.slice(1, -1), [...marks, "italic"]))
    } else out.push({ type: "text", text: part, ...withMarks })
  }
  return out
}

export function draftSection(draft: DraftSection, id: string): Section {
  return {
    type: "section",
    attrs: { id, title: draft.title, numbered: true },
    content: draft.blocks.map(
      (b): BlockNode =>
        b.type === "paragraph"
          ? { type: "paragraph", content: draftInline(b.text) }
          : {
              type: b.ordered ? "orderedList" : "bulletList",
              content: b.items.map((item) => ({
                type: "listItem",
                content: [{ type: "paragraph" as const, content: draftInline(item) }] as [
                  { type: "paragraph"; content: InlineNode[] },
                ],
              })),
            },
    ),
  }
}

// ── Invented specifics ───────────────────────────────────────────────────────
const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
const SPECIFICS: RegExp[] = [
  /[^\s@(<]+@[^\s@]+\.[a-z]{2,}/gi, // email
  /\+?\d[\d\s-]{7,}\d/g, // phone or long number
  /\b(?:KES|KSh|Ksh|USD|EUR|GBP|UGX|TZS)\s?\d[\d,]*(?:\.\d+)?|[$€£]\s?\d[\d,]*(?:\.\d+)?/g, // money
  /\b\d[\d,]*(?:\.\d+)?\s?(?:shillings|dollars|euros|pounds)\b/gi,
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g, // numeric dates
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?,?\\s+\\d{4}\\b`, "gi"),
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"),
  /\b\d+(?:\.\d+)?\s?%/g, // percentage
  /\b\d+\s+(?:business\s+|calendar\s+|working\s+)?(?:days?|weeks?|months?|years?)\b/gi, // duration
]

/**
 * Specific values in proposed text that the person never stated: emails, phone numbers, amounts,
 * dates, percentages and numeric durations. Each must appear in what the person said, or the
 * assistant has to use a blank. Names and jurisdictions can't be told apart from wording by a
 * pattern; the instructions and the person's review cover those.
 */
export function unattestedSpecifics(text: string, userTexts: readonly string[]): string[] {
  const found = new Set<string>()
  for (const pattern of SPECIFICS) {
    for (const m of text.matchAll(pattern)) {
      const value = m[0].trim()
      if (!isValueAttested(value, userTexts)) found.add(value)
    }
  }
  return [...found]
}

// ── Building, applying, staleness ────────────────────────────────────────────
function draftTexts(sections: DraftSection[]): string[] {
  return sections.flatMap((s) => [
    s.title,
    ...s.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : b.items)),
  ])
}

function hasSignatureBlock(section: Section | undefined): boolean {
  return Boolean(section?.content.some((b) => b.type === "signatureBlock"))
}

export type BuildProposalResult =
  | { ok: true; payload: ProposalPayload; sectionId: string | null }
  | { ok: false; error: string }

/**
 * Checks a proposal against the latest version and turns it into a stored change. Refuses edits to
 * sections holding signature blocks (signers are set elsewhere), unknown sections and blanks,
 * duplicate new blanks, and specifics the person never stated. `newId` names inserted sections.
 */
export function buildProposal(
  input:
    | ({ tool: "propose_section_edit" } & ProposeSectionEditInput)
    | ({ tool: "propose_sections" } & ProposeSectionsInput)
    | ({ tool: "define_signers" } & DefineSignersInput),
  data: GeneratedDocumentData,
  userTexts: readonly string[],
  newId: () => string,
): BuildProposalResult {
  if (input.tool === "define_signers") return buildSignersProposal(input, data, userTexts, newId)
  const sections = data.content.content
  const find = (id: string) => sections.find((s) => s.attrs.id === id)

  const taken = new Set(data.variables.map((v) => v.key))
  const clash = input.newBlanks.find((b) => taken.has(b.key))
  if (clash) return { ok: false, error: `A blank called "${clash.key}" already exists; use it.` }
  const newVariables: Variable[] = input.newBlanks.map((b) => ({
    ...b,
    type: b.type ?? "text",
    value: null,
    status: "unresolved",
  }))

  let change: ProposalChange
  let drafts: DraftSection[]
  if (input.tool === "propose_section_edit") {
    const target = find(input.sectionId)
    if (!target) return { ok: false, error: `There is no section with id "${input.sectionId}".` }
    if (hasSignatureBlock(target)) {
      return { ok: false, error: "That section holds signature blocks; it can't be changed here." }
    }
    if (input.operation === "delete") {
      change = { kind: "delete_section", sectionId: input.sectionId }
      drafts = []
    } else {
      const draft = input.section as DraftSection
      const section = draftSection(draft, input.sectionId)
      section.attrs.numbered = target.attrs.numbered
      change = { kind: "replace_section", sectionId: input.sectionId, section }
      drafts = [draft]
    }
  } else {
    if (input.afterSectionId !== null && !find(input.afterSectionId)) {
      return { ok: false, error: `There is no section with id "${input.afterSectionId}".` }
    }
    change = {
      kind: "insert_sections",
      afterSectionId: input.afterSectionId,
      sections: input.sections.map((s) => draftSection(s, newId())),
    }
    drafts = input.sections
  }

  const invented = unattestedSpecifics(draftTexts(drafts).join("\n"), userTexts)
  if (invented.length) {
    return {
      ok: false,
      error: `The person never said ${invented.map((v) => JSON.stringify(v)).join(", ")}. Use blanks ({{key}}, declared in newBlanks) for specifics, then ask.`,
    }
  }

  const payload: ProposalPayload = { change, newVariables }
  let next: GeneratedDocumentData
  try {
    next = GeneratedDocumentDataSchema.parse(applyProposal(data, payload))
  } catch {
    return { ok: false, error: "The proposed text isn't a valid section." }
  }
  const unknown = structureIssues(next).find((i) => i.code === "unknown_variable")
  if (unknown && unknown.code === "unknown_variable") {
    return {
      ok: false,
      error: `Blank "{{${unknown.key}}}" doesn't exist. Declare it in newBlanks or use an existing one.`,
    }
  }
  if (structureIssues(next).length) return { ok: false, error: "The proposal breaks the document." }
  return {
    ok: true,
    payload,
    sectionId: change.kind === "insert_sections" ? null : change.sectionId,
  }
}

function buildSignersProposal(
  input: DefineSignersInput,
  data: GeneratedDocumentData,
  userTexts: readonly string[],
  newId: () => string,
): BuildProposalResult {
  const unsaid = input.roles
    .flatMap((r) => [r.name, r.email])
    .filter((v): v is string => Boolean(v) && !isValueAttested(v as string, userTexts))
  if (unsaid.length) {
    return {
      ok: false,
      error: `The person never said ${unsaid.map((v) => JSON.stringify(v)).join(", ")}. Leave contacts out; they're entered in the Signers tab.`,
    }
  }
  const existing = new Map(data.roles.map((r) => [r.key, r]))
  const signers = SignersDefinitionSchema.parse({
    roles: input.roles.map((r) => ({
      ...r,
      name: r.name ?? existing.get(r.key)?.name ?? null,
      email: r.email ?? existing.get(r.key)?.email ?? null,
    })),
    fields: input.fields,
  })
  const payload: ProposalPayload = { change: { kind: "set_signers", signers }, newVariables: [] }
  try {
    const next = applyProposal(data, payload, newId)
    if (structureIssues(GeneratedDocumentDataSchema.parse(next)).length) {
      return { ok: false, error: "Those signers don't fit the document." }
    }
  } catch (err) {
    if (err instanceof SignersError) return { ok: false, error: err.message }
    return { ok: false, error: "Those signers don't fit the document." }
  }
  return { ok: true, payload, sectionId: null }
}

/** The data with the proposal applied. Throws when its target is gone. */
export function applyProposal(
  data: GeneratedDocumentData,
  payload: ProposalPayload,
  newId: () => string = () => `f_${crypto.randomUUID().slice(0, 8)}`,
): GeneratedDocumentData {
  const { change } = payload
  if (change.kind === "set_signers") return applySigners(data, change.signers, newId)
  const sections = data.content.content
  let next: Section[]
  if (change.kind === "insert_sections") {
    const at =
      change.afterSectionId === null
        ? 0
        : sections.findIndex((s) => s.attrs.id === change.afterSectionId) + 1
    if (at === 0 && change.afterSectionId !== null) throw new Error("Section not found")
    next = [...sections.slice(0, at), ...change.sections, ...sections.slice(at)]
  } else {
    const i = sections.findIndex((s) => s.attrs.id === change.sectionId)
    if (i < 0) throw new Error("Section not found")
    next =
      change.kind === "delete_section"
        ? sections.filter((_, j) => j !== i)
        : sections.map((s, j) => (j === i ? change.section : s))
  }
  return {
    ...data,
    content: { ...data.content, content: next },
    variables: [...data.variables, ...payload.newVariables],
  }
}

/**
 * Out of date: the section it replaces or deletes changed (or went) since the proposal was made,
 * or the section it inserts after is gone.
 */
export function isProposalStale(
  change: ProposalChange,
  base: GeneratedDocumentData,
  current: GeneratedDocumentData,
): boolean {
  const find = (d: GeneratedDocumentData, id: string) =>
    d.content.content.find((s) => s.attrs.id === id)
  if (change.kind === "insert_sections") {
    return change.afterSectionId !== null && !find(current, change.afterSectionId)
  }
  if (change.kind === "set_signers") {
    return JSON.stringify(currentSigners(base)) !== JSON.stringify(currentSigners(current))
  }
  const then = find(base, change.sectionId)
  const now = find(current, change.sectionId)
  return !now || JSON.stringify(then) !== JSON.stringify(now)
}

/** A section as plain text, blanks as their value or `[Label]`: what the diff compares. */
export function sectionText(section: Section, variables: Variable[]): string {
  const lines = [section.attrs.title]
  for (const b of section.content) {
    if (b.type === "paragraph") lines.push(inlineText(b.content, variables))
    else if (b.type === "bulletList" || b.type === "orderedList") {
      for (const item of b.content)
        lines.push(`• ${inlineText(item.content[0].content, variables)}`)
    } else if (b.type === "table") {
      for (const row of b.content) {
        lines.push(
          row.content
            .map((c) => c.content.map((p) => inlineText(p.content, variables)).join(" "))
            .join(" | "),
        )
      }
    } else lines.push("[Signature block]")
  }
  return lines.join("\n")
}

/** Before and after text of a proposal, against the version it was made on. */
export function proposalTexts(
  payload: ProposalPayload,
  base: GeneratedDocumentData,
): { before: string; after: string } {
  const variables = [...base.variables, ...payload.newVariables]
  const { change } = payload
  if (change.kind === "set_signers") {
    return { before: signersText(currentSigners(base)), after: signersText(change.signers) }
  }
  if (change.kind === "insert_sections") {
    return { before: "", after: change.sections.map((s) => sectionText(s, variables)).join("\n\n") }
  }
  const current = base.content.content.find((s) => s.attrs.id === change.sectionId)
  const before = current ? sectionText(current, variables) : ""
  return {
    before,
    after: change.kind === "delete_section" ? "" : sectionText(change.section, variables),
  }
}

// ── Word diff ────────────────────────────────────────────────────────────────
export interface DiffPart {
  kind: "same" | "added" | "removed"
  text: string
}

/** Word-level diff (whitespace kept), by longest common subsequence. Large inputs diff whole. */
export function diffWords(before: string, after: string): DiffPart[] {
  return diffTokens(before, after, /(\s+)/)
}

/** Line-level diff (line breaks kept): for lists such as the signers. */
export function diffLines(before: string, after: string): DiffPart[] {
  return diffTokens(before, after, /(\n)/)
}

function diffTokens(before: string, after: string, separator: RegExp): DiffPart[] {
  const a = before.split(separator).filter(Boolean)
  const b = after.split(separator).filter(Boolean)
  if (a.length * b.length > 4_000_000) {
    return [
      ...(before ? [{ kind: "removed" as const, text: before }] : []),
      ...(after ? [{ kind: "added" as const, text: after }] : []),
    ]
  }
  // lcs[i][j] = length of the longest common subsequence of a[i…] and b[j…], flattened.
  const w = b.length + 1
  const lcs = new Int32Array((a.length + 1) * w)
  const at = (i: number, j: number) => lcs[i * w + j] as number
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const out: DiffPart[] = []
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = out[out.length - 1]
    if (last?.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i] as string)
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) push("removed", a[i++] as string)
    else push("added", b[j++] as string)
  }
  while (i < a.length) push("removed", a[i++] as string)
  while (j < b.length) push("added", b[j++] as string)
  return out
}
