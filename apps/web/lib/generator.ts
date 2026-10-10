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
  kind: "replace_section" | "delete_section" | "insert_sections" | "set_signers"
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
): { key: string; value: string | null }[] {
  const byKey = new Map<string, string | null>()
  for (const q of input.questions) {
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
  if (view.kind === "delete_section") return `Suggested removal of ${name}`
  return `Suggested edit to ${name}`
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
