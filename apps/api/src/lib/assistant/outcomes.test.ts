import { describe, expect, test } from "bun:test"
import type { UIMessage } from "ai"
import { proposalIdsIn, withProposalOutcomes } from "./outcomes"

const proposal = (toolCallId: string, output: unknown) =>
  ({
    type: "tool-propose_section_edit",
    toolCallId,
    state: "output-available",
    input: {},
    output,
  }) as UIMessage["parts"][number]

const pending = (proposalId: string) => ({
  ok: true,
  proposalId,
  status: "pending",
  note: "Shown to the person as a suggested edit; it applies only if they accept it.",
})

const messages: UIMessage[] = [
  { id: "u1", role: "user", parts: [{ type: "text", text: "Tighten clause 2" }] },
  {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "text", text: "Here are two edits." },
      proposal("c1", pending("p1")),
      proposal("c2", pending("p2")),
      proposal("c3", { ok: false, error: "Unknown section." }),
    ],
  },
]

describe("proposal outcomes", () => {
  test("lists the proposals the conversation made, not refusals", () => {
    expect(proposalIdsIn(messages)).toEqual(["p1", "p2"])
  })

  test("each proposal's result reports whether it was accepted or rejected", () => {
    const parts = withProposalOutcomes(
      messages,
      new Map([
        ["p1", "ACCEPTED"],
        ["p2", "REJECTED"],
      ]),
    )[1]?.parts as { output?: { status?: string; note?: string; proposalId?: string } }[]
    expect(parts[1]?.output?.status).toBe("accepted")
    expect(parts[1]?.output?.proposalId).toBe("p1")
    expect(parts[1]?.output?.note).toContain("accepted")
    expect(parts[2]?.output?.status).toBe("rejected")
    expect(parts[2]?.output?.note).toContain("Don't propose it again")
    expect(parts[3]).toEqual(messages[1]?.parts[3] as never)
  })

  test("unknown proposals and other messages are left as they are", () => {
    const out = withProposalOutcomes(messages, new Map([["p1", "STALE"]]))
    expect(out[0]).toBe(messages[0] as UIMessage)
    const parts = out[1]?.parts as { output?: { status?: string } }[]
    expect(parts[1]?.output?.status).toBe("stale")
    expect(parts[2]?.output?.status).toBe("pending")
  })
})
