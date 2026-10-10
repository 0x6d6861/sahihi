import { describe, expect, test } from "bun:test"
import type { AskQuestionsInput } from "@sahihi/core"
import {
  applyRoleContacts,
  applyVariableUpdates,
  currentSigners,
  documentParties,
  findStarter,
  numberSections,
} from "@sahihi/core"
import {
  answeredLines,
  answerValues,
  blankState,
  blanksStatus,
  chatErrorMessage,
  messageSectionId,
  type ProposalView,
  partyForRole,
  pendingSectionIds,
  proposalTitle,
  questionResult,
  replyParagraphs,
  roleIssues,
  sectionExcerpt,
  templateChoices,
  unsignedParties,
} from "./generator"

const input: AskQuestionsInput = {
  questions: [
    { id: "q1", variableKey: "term", question: "How long?", options: ["1 year"] },
    { id: "q2", variableKey: "purpose", question: "What for?", options: [] },
  ],
}

describe("blankState", () => {
  test("filled, skipped or unresolved", () => {
    const v = { key: "k", label: "K", type: "text" as const }
    expect(blankState({ ...v, value: "x", status: "answered" })).toBe("filled")
    expect(blankState({ ...v, value: null, status: "skipped" })).toBe("skipped")
    expect(blankState({ ...v, value: null, status: "unresolved" })).toBe("unresolved")
    expect(blankState(undefined)).toBe("unresolved")
  })
})

describe("question cards", () => {
  test("answers become values; blank or missing answers are skips", () => {
    expect(answerValues(input, { q1: " one year ", q2: "  " })).toEqual([
      { key: "term", value: "one year" },
      { key: "purpose", value: null },
    ])
    expect(answerValues(input, {})).toEqual([
      { key: "term", value: null },
      { key: "purpose", value: null },
    ])
  })

  test("the tool result names every question", () => {
    expect(questionResult(input, { q1: "one year" })).toEqual({
      dismissed: false,
      answers: [
        { questionId: "q1", value: "one year" },
        { questionId: "q2", value: null },
      ],
    })
  })

  test("answered lines pair each question with its answer or a skip", () => {
    const result = questionResult(input, { q1: "one year" })
    expect(answeredLines(input, result)).toEqual([
      { question: "How long?", answer: "one year" },
      { question: "What for?", answer: null },
    ])
  })
})

test("roleIssues keeps one role's problems", () => {
  const issues = [
    { code: "missing_name" as const, message: "a", roleKey: "party_a" },
    { code: "invalid_email" as const, message: "b", roleKey: "party_b" },
    { code: "unresolved_variable" as const, message: "c", variableKey: "term" },
  ]
  expect(roleIssues(issues, "party_a").map((i) => i.message)).toEqual(["a"])
})

describe("proposals", () => {
  const view = (p: Partial<ProposalView>): ProposalView => ({
    id: "p",
    kind: "replace_section",
    sectionId: "purpose",
    status: "PENDING",
    rationale: "",
    before: "",
    after: "",
    createdAt: "",
    ...p,
  })
  const content = findStarter("mutual-nda")?.build().content
  if (!content) throw new Error("missing starter")
  const numbers = numberSections(content)

  test("titles name the section with its number", () => {
    expect(proposalTitle(view({}), content, numbers)).toBe("Suggested edit to 2. Purpose")
    expect(
      proposalTitle(view({ kind: "delete_section", sectionId: "term" }), content, numbers),
    ).toBe("Suggested removal of 7. Term")
    expect(
      proposalTitle(view({ kind: "insert_sections", sectionId: null }), content, numbers),
    ).toBe("Suggested new section")
  })

  test("only pending suggestions mark a section", () => {
    const ids = pendingSectionIds([
      view({ sectionId: "purpose" }),
      view({ sectionId: "term", status: "REJECTED" }),
      view({ kind: "insert_sections", sectionId: null }),
    ])
    expect([...ids]).toEqual(["purpose"])
  })
})

test("templateChoices offers filled blanks in text order and roles with a contact", () => {
  const nda = findStarter("mutual-nda")?.build()
  if (!nda) throw new Error("missing starter")
  const data = applyRoleContacts(
    applyVariableUpdates(
      nda,
      [
        { key: "governing_law", value: "Kenya" },
        { key: "party_a_name", value: "Acme Ltd" },
      ],
      "answer",
    ),
    [{ key: "party_a", name: "Amina Otieno", email: "amina@example.com" }],
  )
  expect(templateChoices(data)).toEqual({
    values: [
      { key: "party_a_name", label: "First party's name", value: "Acme Ltd" },
      { key: "governing_law", label: "Governing law", value: "Kenya" },
    ],
    contacts: [
      { key: "party_a", label: "First party", contact: "Amina Otieno, amina@example.com" },
    ],
  })
})

test("chatErrorMessage shows the API's message, or a generic line", () => {
  const quota = JSON.stringify({ error: "assistant_quota_exceeded", message: "All used." })
  expect(chatErrorMessage(new Error(quota))).toBe("All used.")
  expect(chatErrorMessage(quota)).toBe("All used.")
  expect(chatErrorMessage({ code: "AI_APICallError", message: quota })).toBe("All used.")
  expect(chatErrorMessage(new Error("Failed to fetch"))).toBe(
    "The assistant couldn't reply. Try again in a moment.",
  )
  expect(chatErrorMessage(undefined)).toContain("couldn't reply")
})

describe("drafting chat helpers", () => {
  test("messageSectionId reads only a string section id", () => {
    expect(messageSectionId({ custom: { selection: { sectionId: "term" } } })).toBe("term")
    expect(messageSectionId({ custom: { selection: { sectionId: 3 } } })).toBeNull()
    expect(messageSectionId(undefined)).toBeNull()
    expect(messageSectionId({ custom: {} })).toBeNull()
  })

  test("sectionExcerpt is the section's text on one line, without the title", () => {
    const data = findStarter("mutual-nda")?.build()
    if (!data) throw new Error("missing starter")
    const filled = applyVariableUpdates(data, [{ key: "term", value: "one year" }], "answer")
    const excerpt = sectionExcerpt(filled, "term")
    expect(
      excerpt?.startsWith(
        "This Agreement starts on the Effective Date and continues for one year.",
      ),
    ).toBe(true)
    expect(excerpt).not.toContain("\n")
    expect(sectionExcerpt(filled, "nope")).toBeNull()
  })

  test("blanksStatus counts open blanks", () => {
    const issue = (key: string) => ({
      code: "unresolved_variable" as const,
      message: "x",
      variableKey: key,
    })
    expect(blanksStatus([issue("a")]).label).toBe("1 blank open")
    expect(blanksStatus([issue("a"), issue("b")]).label).toBe("2 blanks open")
    expect(blanksStatus([{ code: "no_signers", message: "x" }])).toEqual({
      open: 0,
      label: "All blanks filled",
    })
  })

  test("replyParagraphs splits paragraphs and bold runs", () => {
    expect(replyParagraphs("Drafted a **mutual NDA** today.\n\nNext:")).toEqual([
      [
        { text: "Drafted a ", bold: false },
        { text: "mutual NDA", bold: true },
        { text: " today.", bold: false },
      ],
      [{ text: "Next:", bold: false }],
    ])
    expect(replyParagraphs("a * b ** c")).toEqual([[{ text: "a * b ** c", bold: false }]])
  })
})

describe("signers and parties", () => {
  const nda = () => {
    const data = findStarter("mutual-nda")?.build()
    if (!data) throw new Error("missing starter")
    data.variables.push({
      key: "party_c_name",
      label: "Third party's name",
      type: "text",
      value: null,
      status: "unresolved",
      party: true,
    })
    return data
  }

  test("finds each signer's party from the form's links", () => {
    const data = nda()
    const draft = currentSigners(data)
    expect(partyForRole(documentParties(data), draft, "party_a")?.label).toBe("First party's name")
    expect(partyForRole(documentParties(data), draft, "nobody")).toBeNull()
  })

  test("lists parties nobody in the form signs for, including a removed signer's", () => {
    const data = nda()
    const draft = currentSigners(data)
    expect(unsignedParties(documentParties(data), draft).map((p) => p.variableKey)).toEqual([
      "party_c_name",
    ])
    draft.roles = draft.roles.filter((r) => r.key !== "party_b")
    expect(unsignedParties(documentParties(data), draft).map((p) => p.variableKey)).toEqual([
      "party_b_name",
      "party_c_name",
    ])
  })
})
