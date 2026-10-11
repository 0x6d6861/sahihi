import { describe, expect, test } from "bun:test"
import { referencedVariableKeys } from "./document"
import { importContent } from "./import/content"
import { applyProposal, buildProposal, isProposalStale, proposalTexts } from "./proposals"

const doc = () =>
  importContent(
    [
      { type: "heading", level: 1, text: "Parties", numbered: true },
      {
        type: "paragraph",
        runs: [
          { text: "This agreement is between Acme Ltd and Acmeville Co, " },
          { text: "Acme Ltd", marks: ["bold"] },
        ],
      },
    ],
    "x.pdf",
  )

const propose = (blanks: { text: string; key: string; label: string }[]) =>
  buildProposal(
    {
      tool: "propose_blanks",
      blanks: blanks.map((b) => ({ ...b, type: "text" as const })),
      rationale: "Parties as blanks",
    },
    doc(),
    [],
    () => "n",
  )

describe("make_blanks proposals", () => {
  test("turns every whole-word occurrence into a prefilled blank, marks kept", () => {
    const built = propose([{ text: "Acme Ltd", key: "party_a", label: "First party" }])
    if (!built.ok) throw new Error(built.error)
    const next = applyProposal(doc(), built.payload)
    expect(referencedVariableKeys(next.content)).toEqual(["party_a"])
    const para = next.content.content[0]?.content[0]
    expect(para).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "This agreement is between " },
        { type: "variable", attrs: { key: "party_a" } },
        { type: "text", text: " and Acmeville Co, " },
        { type: "variable", attrs: { key: "party_a" }, marks: [{ type: "bold" }] },
      ],
    })
    expect(next.variables).toEqual([
      {
        key: "party_a",
        label: "First party",
        type: "text",
        value: "Acme Ltd",
        status: "answered",
        source: "import",
      },
    ])
    expect(proposalTexts(built.payload, doc()).after).toBe('"Acme Ltd" → [First party]')
  })

  test("refuses text that isn't in the document, taken keys and overlapping texts", () => {
    expect(propose([{ text: "Globex", key: "x", label: "X" }])).toMatchObject({ ok: false })
    expect(propose([{ text: "Acmevill", key: "x", label: "X" }])).toMatchObject({ ok: false })
    expect(
      propose([
        { text: "Acme Ltd", key: "a", label: "A" },
        { text: "Acme Ltd", key: "a", label: "B" },
      ]),
    ).toMatchObject({ ok: false })
    expect(
      propose([
        { text: "Acme Ltd", key: "a", label: "A" },
        { text: "between Acme Ltd", key: "b", label: "B" },
      ]),
    ).toMatchObject({ ok: false })
  })

  test("goes stale once the text is gone", () => {
    const built = propose([{ text: "Acme Ltd", key: "party_a", label: "First party" }])
    if (!built.ok) throw new Error(built.error)
    const applied = applyProposal(doc(), built.payload)
    expect(isProposalStale(built.payload.change, doc(), doc())).toBe(false)
    expect(isProposalStale(built.payload.change, doc(), applied)).toBe(true)
  })
})
