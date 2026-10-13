import type {
  AskQuestionsInput,
  AskQuestionsResult,
  DocContent,
  DocumentParty,
  GeneratedDocumentData,
  GenerationPreflightIssue,
  ProposalStatus,
  SignersDefinition,
  Variable,
} from "@sahihi/core"
import { referencedVariableKeys, sectionText } from "@sahihi/core"

/**
 * Pure helpers for the AI document generator (docs/ai-documents.md → Web). DOM-free so they're
 * unit-tested; the components in `components/app/generator/` render what these decide.
 */

export interface GeneratorDetail {
  document: {
    id: string
    title: string
    status: "DRAFT" | "FINALIZED"
    envelopeId: string | null
    documentId: string | null
    canEdit: boolean
    /** How it started: a starter's key, "blank" or "import" (ADR 0049). */
    starter: string
    /** The finalised document this draft is a new version of. */
    previousId: string | null
    /** The new version started from this finalised document, if any. */
    newVersionId: string | null
  }
  version: { id: string; number: number; data: GeneratedDocumentData }
  messages: unknown[]
  issues: GenerationPreflightIssue[]
  proposals: ProposalView[]
}

/** An assistant proposal as the page shows it (`GET /generated-documents/:id`). */
export interface ProposalView {
  id: string
  kind:
    | "replace_section"
    | "delete_section"
    | "insert_sections"
    | "set_signers"
    | "make_blanks"
    | "set_title"
  sectionId: string | null
  /** STALE also for pending proposals whose section has changed since. */
  status: ProposalStatus
  rationale: string
  before: string
  after: string
  createdAt: string
}

/** How a blank shows in the document: a value, or a distinct non-editable chip. */
export type BlankState = "filled" | "unresolved" | "skipped"

export function blankState(v: Variable | undefined): BlankState {
  if (v?.value != null) return "filled"
  return v?.status === "skipped" ? "skipped" : "unresolved"
}

/** The values a question card sends to `POST …/variables` (null = skipped), one per blank. */
export function answerValues(
  input: AskQuestionsInput,
  answers: Readonly<Record<string, string | null>>,
  variables: readonly Pick<Variable, "key">[],
): { key: string; value: string | null }[] {
  const byKey = new Map<string, string | null>()
  for (const q of input.questions) {
    // A question about something that isn't a blank (who signs for a company) changes nothing in
    // the document: its answer only goes back to the assistant in the tool result.
    if (!variables.some((v) => v.key === q.variableKey)) continue
    const raw = answers[q.id]
    const value = raw == null ? null : raw.trim() || null
    byKey.set(q.variableKey, value)
  }
  return [...byKey].map(([key, value]) => ({ key, value }))
}

/** The tool result the assistant gets back for a question card. */
export function questionResult(
  input: AskQuestionsInput,
  answers: Readonly<Record<string, string | null>>,
): AskQuestionsResult {
  return {
    dismissed: false,
    answers: input.questions.map((q) => {
      const raw = answers[q.id]
      return { questionId: q.id, value: raw == null ? null : raw.trim() || null }
    }),
  }
}

/** Where a question card's unsent answers are kept in the browser, per document and tool call. */
export function questionDraftKey(documentId: string, toolCallId: string): string {
  return `sahihi:questions:${documentId}:${toolCallId}`
}

/**
 * Where a question card picks up from its saved answers (a reload, or a reply that failed before
 * the answers reached the assistant): the answers that still match a question, and the first
 * question without one. When every question has an answer it opens the last one, with its typed
 * answer back in the field, so one press sends them all again.
 */
export function resumeQuestions(
  input: AskQuestionsInput,
  saved: unknown,
): { answers: Record<string, string | null>; index: number; draft: string } {
  const answers: Record<string, string | null> = {}
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    for (const q of input.questions) {
      const value = (saved as Record<string, unknown>)[q.id]
      if (typeof value === "string" || value === null) answers[q.id] = value
    }
  }
  const open = input.questions.findIndex((q) => !(q.id in answers))
  if (open !== -1) return { answers, index: open, draft: "" }
  const index = Math.max(0, input.questions.length - 1)
  const last = input.questions[index]
  const value = last ? answers[last.id] : null
  const draft = last && value && !last.options.includes(value) ? value : ""
  return { answers, index, draft }
}

/** Answered questions as "question → answer" lines for the collapsed cards. */
export function answeredLines(
  input: AskQuestionsInput,
  result: AskQuestionsResult,
): { question: string; answer: string | null }[] {
  return input.questions.map((q) => ({
    question: q.question,
    answer: result.answers.find((a) => a.questionId === q.id)?.value ?? null,
  }))
}

/** The party a signer signs for in the Signers form (its draft link), if any. */
export function partyForRole(
  parties: readonly DocumentParty[],
  draft: SignersDefinition,
  roleKey: string,
): DocumentParty | null {
  const key = draft.parties[roleKey]
  return (key && parties.find((p) => p.variableKey === key)) || null
}

/** Parties in the document that no signer in the form signs for. */
export function unsignedParties(
  parties: readonly DocumentParty[],
  draft: SignersDefinition,
): DocumentParty[] {
  const roles = new Set(draft.roles.map((r) => r.key))
  const linked = new Set(
    Object.entries(draft.parties)
      .filter(([role]) => roles.has(role))
      .map(([, key]) => key),
  )
  return parties.filter((p) => !linked.has(p.variableKey))
}

/** Problems that belong to one signer role, for the Signers tab. */
export function roleIssues(issues: readonly GenerationPreflightIssue[], roleKey: string) {
  return issues.filter((i) => i.roleKey === roleKey)
}

/** The issues the document tab lists: blanks still to fill, in the order the text uses them. */
export function blankIssues(issues: readonly GenerationPreflightIssue[]) {
  return issues.filter((i) => i.code === "unresolved_variable")
}

/** "Suggested edit to 2. Purpose": what a proposal card is called. */
export function proposalTitle(
  view: ProposalView,
  content: DocContent,
  numbers: Map<string, number | null>,
): string {
  const section = content.content.find((s) => s.attrs.id === view.sectionId)
  const name = section
    ? `${numbers.get(section.attrs.id) ? `${numbers.get(section.attrs.id)}. ` : ""}${section.attrs.title}`
    : "a section"
  if (view.kind === "insert_sections") return "Suggested new section"
  if (view.kind === "set_signers") return "Suggested signers"
  if (view.kind === "make_blanks") return "Suggested blanks"
  if (view.kind === "set_title") return "Suggested title"
  if (view.kind === "delete_section") return `Suggested removal of ${name}`
  return `Suggested edit to ${name}`
}

/** The assistant's tools whose result is a proposal for the person to accept or reject. */
export const PROPOSAL_TOOL_NAMES: readonly string[] = [
  "propose_section_edit",
  "propose_sections",
  "define_signers",
  "propose_blanks",
  "propose_title",
]

interface ThreadMessageLike {
  role: string
  content: readonly { type: string; toolName?: string; result?: unknown }[]
}

/**
 * The proposals to continue the conversation after: when the last message is the assistant's, all
 * its tool calls have results, and the person has decided every proposal in it during this visit
 * (at least one, and none still waiting), the assistant replies on its own. Empty otherwise, or
 * once it already continued after them.
 */
export function proposalsToContinueAfter(
  last: ThreadMessageLike | undefined,
  proposals: readonly Pick<ProposalView, "id" | "status">[],
  decided: ReadonlySet<string>,
  continued: ReadonlySet<string>,
): string[] {
  if (last?.role !== "assistant") return []
  const calls = last.content.filter((p) => p.type === "tool-call")
  if (calls.some((p) => p.result === undefined)) return []
  const ids = calls.flatMap((p) => {
    if (!p.toolName || !PROPOSAL_TOOL_NAMES.includes(p.toolName)) return []
    const r = p.result as { ok?: unknown; proposalId?: unknown } | null
    return r?.ok === true && typeof r.proposalId === "string" ? [r.proposalId] : []
  })
  if (ids.length === 0 || ids.some((id) => continued.has(id))) return []
  if (!ids.some((id) => decided.has(id))) return []
  const waiting = ids.some((id) => {
    const status = proposals.find((p) => p.id === id)?.status
    return status === undefined || status === "PENDING"
  })
  return waiting ? [] : ids
}

/** Sections with a suggestion waiting, for the editor's badge. */
export function pendingSectionIds(proposals: readonly ProposalView[]): Set<string> {
  return new Set(
    proposals
      .filter((p) => p.status === "PENDING" && p.sectionId)
      .map((p) => p.sectionId as string),
  )
}

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  PENDING: "Waiting for you",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  STALE: "Out of date",
}

/**
 * What the "Save as template" dialog offers to keep: filled blanks the text uses, in the text's
 * order, and roles with a contact. Everything else is cleared anyway.
 */
export function templateChoices(data: GeneratedDocumentData) {
  const byKey = new Map(data.variables.map((v) => [v.key, v]))
  const values = referencedVariableKeys(data.content).flatMap((key) => {
    const v = byKey.get(key)
    return v?.value != null ? [{ key, label: v.label, value: v.value }] : []
  })
  const contacts = data.roles
    .filter((r) => r.name || r.email)
    .map((r) => ({
      key: r.key,
      label: r.label,
      contact: [r.name, r.email].filter(Boolean).join(", "),
    }))
  return { values, contacts }
}

/** A workspace template as `/generate` lists it (`GET /generated-documents/templates`). */
export interface GenerationTemplateItem {
  id: string
  name: string
  description: string | null
  createdAt: string
  createdBy: { name: string }
  canManage: boolean
}

/**
 * What to show when an assistant reply fails. The API's JSON error (e.g. the plan's monthly
 * replies used up, 402) arrives as the error's message; anything else gets a generic retry line.
 */
export function chatErrorMessage(error: unknown): string {
  // assistant-ui hands over a plain `{ code, message }` object, not an Error.
  const text =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : ""
  try {
    const body = JSON.parse(text) as { message?: unknown }
    if (typeof body.message === "string" && body.message) return body.message
  } catch {
    // not JSON
  }
  return "The assistant couldn't reply. Try again in a moment."
}

/**
 * The selected section a chat message is about, from the message's metadata
 * (`metadata.custom.selection.sectionId`). Only the id is stored: the label and excerpt are
 * always read from the current document.
 */
export function messageSectionId(metadata: unknown): string | null {
  const custom = (metadata as { custom?: { selection?: { sectionId?: unknown } } } | undefined)
    ?.custom
  const id = custom?.selection?.sectionId
  return typeof id === "string" && id ? id : null
}

/** A section's text on one line, without its title: the excerpt under a selected-section chip. */
export function sectionExcerpt(data: GeneratedDocumentData, sectionId: string): string | null {
  const section = data.content.content.find((s) => s.attrs.id === sectionId)
  if (!section) return null
  return sectionText(section, data.variables)
    .split("\n")
    .slice(1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

/** "6 blanks open" or "All blanks filled": the pill beside the document tabs. */
export function blanksStatus(issues: readonly GenerationPreflightIssue[]): {
  open: number
  label: string
} {
  const open = blankIssues(issues).length
  if (open === 0) return { open, label: "All blanks filled" }
  return { open, label: `${open} ${open === 1 ? "blank" : "blanks"} open` }
}

/** Blanks the text uses that are still empty, in the order the text uses them. */
export function openBlankKeys(data: GeneratedDocumentData): string[] {
  const empty = new Set(data.variables.filter((v) => v.value === null).map((v) => v.key))
  return referencedVariableKeys(data.content).filter((key) => empty.has(key))
}

/**
 * The open blank to fill after `afterKey` (the first one when it's absent or the last), never
 * `afterKey` itself: "Save and next" and the blanks pill step through the document with it.
 */
export function nextOpenBlank(data: GeneratedDocumentData, afterKey?: string): string | null {
  const keys = referencedVariableKeys(data.content)
  const open = new Set(openBlankKeys(data))
  const start = afterKey ? keys.indexOf(afterKey) + 1 : 0
  for (const key of [...keys.slice(start), ...keys.slice(0, start)]) {
    if (key !== afterKey && open.has(key)) return key
  }
  return null
}

/** Where the person fixes a finalise problem: a blank in the text, or the Signers tab. */
export type IssueTarget = { kind: "blank"; key: string } | { kind: "signers"; roleKey?: string }

export function issueTarget(issue: GenerationPreflightIssue): IssueTarget | null {
  if (issue.code === "unresolved_variable" && issue.variableKey) {
    return { kind: "blank", key: issue.variableKey }
  }
  if (issue.code === "invalid_structure") return null
  return issue.roleKey ? { kind: "signers", roleKey: issue.roleKey } : { kind: "signers" }
}

/**
 * The assistant's reply as paragraphs of plain and **bold** runs. Replies are plain text (the
 * prompt asks for no Markdown headings); bold is the one emphasis worth showing.
 */
export function replyParagraphs(text: string): { text: string; bold: boolean }[][] {
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) =>
      para
        .split(/(\*\*[^*\n]+\*\*)/)
        .filter(Boolean)
        .map((run) =>
          run.startsWith("**") && run.endsWith("**") && run.length > 4
            ? { text: run.slice(2, -2), bold: true }
            : { text: run, bold: false },
        ),
    )
}

/** Why an import was refused (`POST /generated-documents/import`, ADR 0049), for the dialog. */
export function importErrorMessage(error: unknown): string {
  const body = (error as { body?: { error?: string; message?: string } | null })?.body
  if (body?.message && body.error && body.error !== "validation_error") return body.message
  const status = (error as { status?: number })?.status
  if (status === 413) return "This file is too large to import (10 MB at most)."
  if (status === 429) return "Too many imports in a row. Try again in a minute."
  return "The file couldn't be imported. Try again."
}

/** How a draft started, for the assistant's first card: a blank page, an import, or a starter. */
export function draftOrigin(starter: string): "blank" | "import" | "starter" {
  return starter === "blank" ? "blank" : starter === "import" ? "import" : "starter"
}

// ── Chat attachments (docs/ai-documents.md → Attachments, ADR 0050) ─────────────────
/** The API's limits, repeated here for the browser's checks (the API checks again). */
export const CHAT_ATTACHMENT_LIMITS = {
  perMessage: 3,
  imageBytes: 5 * 1024 * 1024,
  documentBytes: 10 * 1024 * 1024,
} as const
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".csv"]

/** What the file picker offers. */
export const CHAT_ATTACHMENT_ACCEPT = [...DOCUMENT_EXTENSIONS, ...IMAGE_TYPES].join(",")

/**
 * How a picked file is attached: an image goes as it is (for reference), a document is read on
 * the server and goes as its text. A string is why it can't be attached.
 */
export function chatAttachmentKind(file: {
  name: string
  type: string
  size: number
}): "image" | "document" | string {
  if (IMAGE_TYPES.includes(file.type)) {
    return file.size <= CHAT_ATTACHMENT_LIMITS.imageBytes
      ? "image"
      : `${file.name}: images can be at most 5 MB.`
  }
  const name = file.name.toLowerCase()
  if (DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return file.size <= CHAT_ATTACHMENT_LIMITS.documentBytes
      ? "document"
      : `${file.name}: files can be at most 10 MB.`
  }
  return `${file.name}: attach a PDF, Word or text file, or an image (PNG, JPEG, WebP, GIF).`
}

/** A document's extracted text as the data URL the message carries (UTF-8, base64). */
export function textDataUrl(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:text/plain;charset=utf-8;base64,${btoa(binary)}`
}

type ChatPart = { type: string; mediaType?: string; filename?: string }

/**
 * The conversation as the browser sends it: images only on the last message of the person's.
 * Earlier images aren't kept by the server anyway (they're a note once saved), and resending them
 * on every turn would make each request carry all of them. The note matches the server's.
 */
export function withoutEarlierImages<M extends { role: string; parts: ChatPart[] }>(
  messages: M[],
): M[] {
  const last = messages.findLastIndex((m) => m.role === "user")
  return messages.map((m, i) => {
    if (i === last || m.role !== "user") return m
    if (!m.parts.some((p) => p.type === "file" && p.mediaType?.startsWith("image/"))) return m
    return {
      ...m,
      parts: m.parts.map((p) =>
        p.type === "file" && p.mediaType?.startsWith("image/")
          ? { type: "text", text: `[Image “${p.filename ?? "image"}” attached, not kept]` }
          : p,
      ),
    }
  })
}
