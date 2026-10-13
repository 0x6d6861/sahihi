import type { ProposalStatus } from "@sahihi/core"
import type { UIMessage } from "ai"

/**
 * What became of the assistant's proposals (docs/ai-documents.md → Proposals). A proposal tool's
 * result is saved in the conversation as it was when the proposal was made ("pending"). Before
 * each turn the server replaces that with the proposal's current status, so the assistant reads
 * whether the person accepted or rejected it where it made it, however long ago.
 */

export const PROPOSAL_TOOLS = [
  "propose_section_edit",
  "propose_sections",
  "define_signers",
  "propose_blanks",
  "propose_title",
] as const

const NOTES: Record<ProposalStatus, string> = {
  PENDING: "Shown to the person as a suggested edit; they haven't accepted or rejected it yet.",
  ACCEPTED: "The person accepted it: the change is in the document now.",
  REJECTED: "The person rejected it: nothing changed. Don't propose it again unless they ask.",
  STALE:
    "Out of date: the document changed before the person decided, so nothing was applied. Propose it again on the current text if it's still needed.",
}

type Part = UIMessage["parts"][number]

const isProposalPart = (p: Part): p is Part & { toolCallId: string; output?: unknown } =>
  PROPOSAL_TOOLS.some((tool) => p.type === `tool-${tool}`)

/** The proposal ids the conversation's proposal tool results name. */
export function proposalIdsIn(messages: UIMessage[]): string[] {
  const ids = new Set<string>()
  for (const m of messages) {
    for (const p of m.parts) {
      const id = isProposalPart(p) ? proposalIdOf(p) : null
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

/** The messages with each proposal result's status and note set to the proposal's current status. */
export function withProposalOutcomes(
  messages: UIMessage[],
  statuses: ReadonlyMap<string, ProposalStatus>,
): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || !m.parts.some(isProposalPart)) return m
    return {
      ...m,
      parts: m.parts.map((p): Part => {
        if (!isProposalPart(p)) return p
        const id = proposalIdOf(p)
        const status = id ? statuses.get(id) : undefined
        if (!status) return p
        return {
          ...p,
          output: {
            ...(p.output as object),
            status: status.toLowerCase(),
            note: NOTES[status],
          },
        } as Part
      }),
    }
  })
}

function proposalIdOf(p: { state?: unknown; output?: unknown }): string | null {
  if (p.state !== "output-available") return null
  const output = p.output as { ok?: unknown; proposalId?: unknown } | null | undefined
  return output?.ok === true && typeof output.proposalId === "string" ? output.proposalId : null
}
