import { describe, expect, test } from "bun:test"
import { applyVariableUpdates, referencedVariableKeys } from "./document"
import {
  applyProposal,
  buildProposal,
  diffLines,
  diffWords,
  draftInline,
  isProposalStale,
  ProposalPayloadSchema,
  ProposeSectionEditInputSchema,
  proposalTexts,
  unattestedSpecifics,
} from "./proposals"
import { findStarter } from "./starters"

const nda = () => {
  const data = findStarter("mutual-nda")?.build()
  if (!data) throw new Error("missing starter")
  return data
}
let n = 0
const newId = () => `new_${++n}`

describe("draftInline", () => {
  test("blanks, bold and italic", () => {
    expect(draftInline("Pay {{fee}} by **{{due_date}} latest** or *never*.")).toEqual([
      { type: "text", text: "Pay " },
      { type: "variable", attrs: { key: "fee" } },
      { type: "text", text: " by " },
      { type: "variable", attrs: { key: "due_date" }, marks: [{ type: "bold" }] },
      { type: "text", text: " latest", marks: [{ type: "bold" }] },
      { type: "text", text: " or " },
      { type: "text", text: "never", marks: [{ type: "italic" }] },
      { type: "text", text: "." },
    ])
  })

  test("stray asterisks and braces stay text", () => {
    expect(draftInline("a * b {{Not a key}}")).toEqual([
      { type: "text", text: "a * b {{Not a key}}" },
    ])
  })
})

describe("unattestedSpecifics", () => {
  test("finds emails, phones, money, dates, percentages and durations the person never said", () => {
    const text =
      "Write to legal@acme.co.ke or +254 712 345 678. Fee KES 50,000 due 1 March 2027, " +
      "on 2027-03-01 or 01/03/2027, at 5% interest, within 30 days."
    expect(unattestedSpecifics(text, []).sort()).toEqual(
      [
        "legal@acme.co.ke",
        "+254 712 345 678",
        "KES 50,000",
        "1 March 2027",
        "2027-03-01",
        "01/03/2027",
        "5%",
        "30 days",
      ].sort(),
    )
  })

  test("accepts what the person said and plain wording", () => {
    expect(unattestedSpecifics("Payment within 30 days.", ["We pay within 30 days"])).toEqual([])
    expect(unattestedSpecifics("Each Party shall keep it confidential.", [])).toEqual([])
  })
})

describe("buildProposal", () => {
  test("replace: keeps the section id, converts the draft, declares new blanks", () => {
    const result = buildProposal(
      {
        tool: "propose_section_edit",
        sectionId: "purpose",
        operation: "replace",
        section: {
          title: "Purpose",
          blocks: [
            { type: "paragraph", text: "The Parties discuss {{purpose}} for {{project_name}}." },
            { type: "list", ordered: false, items: ["first", "second"] },
          ],
        },
        newBlanks: [{ key: "project_name", label: "Project name", type: "text" }],
        rationale: "Name the project",
      },
      nda(),
      [],
      newId,
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.sectionId).toBe("purpose")
    const next = applyProposal(nda(), result.payload)
    const purpose = next.content.content.find((s) => s.attrs.id === "purpose")
    expect(purpose?.content.map((b) => b.type)).toEqual(["paragraph", "bulletList"])
    expect(referencedVariableKeys(next.content)).toContain("project_name")
    expect(next.variables.find((v) => v.key === "project_name")).toMatchObject({
      value: null,
      status: "unresolved",
    })
    // Stored payloads round-trip through the schema.
    expect(ProposalPayloadSchema.parse(JSON.parse(JSON.stringify(result.payload)))).toEqual(
      result.payload,
    )
  })

  test("refuses invented specifics, unknown blanks, clashing blanks and signature sections", () => {
    const base = {
      tool: "propose_section_edit" as const,
      sectionId: "term",
      operation: "replace" as const,
      newBlanks: [],
      rationale: "x",
    }
    const invented = buildProposal(
      {
        ...base,
        section: { title: "Term", blocks: [{ type: "paragraph", text: "Runs for 2 years." }] },
      },
      nda(),
      [],
      newId,
    )
    expect(invented).toMatchObject({ ok: false })
    if (!invented.ok) expect(invented.error).toContain('"2 years"')

    const unknown = buildProposal(
      {
        ...base,
        section: { title: "Term", blocks: [{ type: "paragraph", text: "Runs {{nope}}." }] },
      },
      nda(),
      [],
      newId,
    )
    expect(unknown.ok ? "" : unknown.error).toContain("{{nope}}")

    const clash = buildProposal(
      {
        ...base,
        section: { title: "Term", blocks: [{ type: "paragraph", text: "x" }] },
        newBlanks: [{ key: "term", label: "Term", type: "text" }],
      },
      nda(),
      [],
      newId,
    )
    expect(clash.ok).toBe(false)

    const signatures = buildProposal(
      { ...base, sectionId: "signatures", operation: "delete" },
      nda(),
      [],
      newId,
    )
    expect(signatures.ok ? "" : signatures.error).toContain("signature")

    expect(
      buildProposal({ ...base, sectionId: "nope", operation: "delete" }, nda(), [], newId).ok,
    ).toBe(false)
  })

  test("what the person said is allowed", () => {
    const result = buildProposal(
      {
        tool: "propose_section_edit",
        sectionId: "term",
        operation: "replace",
        section: { title: "Term", blocks: [{ type: "paragraph", text: "Runs for 2 years." }] },
        newBlanks: [],
        rationale: "As asked",
      },
      nda(),
      ["Make it 2 years please"],
      newId,
    )
    expect(result.ok).toBe(true)
  })

  test("insert after a section, or at the start; delete", () => {
    const inserted = buildProposal(
      {
        tool: "propose_sections",
        afterSectionId: "purpose",
        sections: [
          { title: "Non-solicitation", blocks: [{ type: "paragraph", text: "No poaching." }] },
        ],
        newBlanks: [],
        rationale: "Common in NDAs",
      },
      nda(),
      [],
      newId,
    )
    if (!inserted.ok) throw new Error(inserted.error)
    const ids = applyProposal(nda(), inserted.payload).content.content.map((s) => s.attrs.id)
    expect(ids.slice(0, 3)).toEqual(["parties", "purpose", expect.stringMatching(/^new_/)])

    const first = buildProposal(
      {
        tool: "propose_sections",
        afterSectionId: null,
        sections: [{ title: "Background", blocks: [{ type: "paragraph", text: "Context." }] }],
        newBlanks: [],
        rationale: "x",
      },
      nda(),
      [],
      newId,
    )
    if (!first.ok) throw new Error(first.error)
    expect(applyProposal(nda(), first.payload).content.content[0]?.attrs.title).toBe("Background")

    const deleted = buildProposal(
      {
        tool: "propose_section_edit",
        sectionId: "return",
        operation: "delete",
        newBlanks: [],
        rationale: "x",
      },
      nda(),
      [],
      newId,
    )
    if (!deleted.ok) throw new Error(deleted.error)
    const after = applyProposal(nda(), deleted.payload)
    expect(after.content.content.some((s) => s.attrs.id === "return")).toBe(false)
  })

  test("a replacement needs its section", () => {
    expect(
      ProposeSectionEditInputSchema.safeParse({
        sectionId: "term",
        operation: "replace",
        rationale: "x",
      }).success,
    ).toBe(false)
  })
})

describe("staleness and texts", () => {
  const proposal = () => {
    const r = buildProposal(
      {
        tool: "propose_section_edit",
        sectionId: "purpose",
        operation: "replace",
        section: { title: "Purpose", blocks: [{ type: "paragraph", text: "Shorter purpose." }] },
        newBlanks: [],
        rationale: "Simpler",
      },
      nda(),
      [],
      newId,
    )
    if (!r.ok) throw new Error(r.error)
    return r.payload
  }

  test("stale when the target section changed, not when only blanks did", () => {
    const base = nda()
    const filled = applyVariableUpdates(base, [{ key: "purpose", value: "a pilot" }], "answer")
    expect(isProposalStale(proposal().change, base, filled)).toBe(false)
    const edited = applyProposal(base, proposal())
    expect(isProposalStale(proposal().change, base, edited)).toBe(true)
    const otherEdit = structuredClone(base)
    const term = otherEdit.content.content.find((s) => s.attrs.id === "term")
    if (term) term.attrs.title = "Duration"
    expect(isProposalStale(proposal().change, base, otherEdit)).toBe(false)
  })

  test("before and after text show blanks by label", () => {
    const { before, after } = proposalTexts(proposal(), nda())
    expect(before).toContain("[Purpose of the disclosure]")
    expect(after).toBe("Purpose\nShorter purpose.")
  })
})

describe("diffWords", () => {
  test("marks removed and added words, keeps the rest", () => {
    expect(diffWords("keep it confidential now", "keep it secret now")).toEqual([
      { kind: "same", text: "keep it " },
      { kind: "removed", text: "confidential" },
      { kind: "added", text: "secret" },
      { kind: "same", text: " now" },
    ])
  })

  test("inserts and deletes from nothing", () => {
    expect(diffWords("", "new text")).toEqual([{ kind: "added", text: "new text" }])
    expect(diffWords("old", "")).toEqual([{ kind: "removed", text: "old" }])
  })
})

test("diffLines compares whole lines", () => {
  expect(diffLines("A: x\nB: y", "A: x\nB: z\nC: w")).toEqual([
    { kind: "same", text: "A: x\n" },
    { kind: "removed", text: "B: y" },
    { kind: "added", text: "B: z\nC: w" },
  ])
})
