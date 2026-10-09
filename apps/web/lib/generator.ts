import type {
  AskQuestionsInput,
  AskQuestionsResult,
  DocContent,
  GeneratedDocumentData,
  GenerationPreflightIssue,
  ProposalStatus,
  Variable,
} from "@sahihi/core"

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
  }
  version: { id: string; number: number; data: GeneratedDocumentData }
  messages: unknown[]
  issues: GenerationPreflightIssue[]
  proposals: ProposalView[]
}

/** An assistant proposal as the page shows it (`GET /generated-documents/:id`). */
export interface ProposalView {
  id: string
  kind: "replace_section" | "delete_section" | "insert_sections"
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
