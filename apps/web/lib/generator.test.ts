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
  CHAT_ATTACHMENT_LIMITS,
  chatAttachmentKind,
  chatErrorMessage,
  draftOrigin,
  importErrorMessage,
  issueTarget,
  messageSectionId,
  nextOpenBlank,
  openBlankKeys,
  type ProposalView,
  partyForRole,
  pendingSectionIds,
  proposalTitle,
  questionResult,
  replyParagraphs,
  roleIssues,
  sectionExcerpt,
  templateChoices,
  textDataUrl,
  unsignedParties,
  withoutEarlierImages,
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
    const blanks = [{ key: "term" }, { key: "purpose" }]
    expect(answerValues(input, { q1: " one year ", q2: "  " }, blanks)).toEqual([
      { key: "term", value: "one year" },
      { key: "purpose", value: null },
    ])
    expect(answerValues(input, {}, blanks)).toEqual([
      { key: "term", value: null },
      { key: "purpose", value: null },
    ])
  })

  test("answers about keys that aren't blanks aren't saved", () => {
    expect(answerValues(input, { q1: "one year", q2: "Jane Doe" }, [{ key: "term" }])).toEqual([
      { key: "term", value: "one year" },
    ])
    expect(answerValues(input, { q1: "one year" }, [])).toEqual([])
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

  test("openBlankKeys and nextOpenBlank follow the text's order", () => {
    const data = findStarter("mutual-nda")?.build()
    if (!data) throw new Error("missing starter")
    const open = openBlankKeys(data)
    expect(open.length).toBeGreaterThan(2)
    const [first, second, third] = open as [string, string, string]
    expect(nextOpenBlank(data)).toBe(first)
    expect(nextOpenBlank(data, first)).toBe(second)
    // A filled blank is skipped; after the last, it wraps to the first.
    const filled = applyVariableUpdates(data, [{ key: second, value: "x" }], "answer")
    expect(openBlankKeys(filled)).not.toContain(second)
    expect(nextOpenBlank(filled, first)).toBe(third)
    expect(nextOpenBlank(filled, open[open.length - 1])).toBe(first)
    // The only open blank is never its own next.
    const one = applyVariableUpdates(
      data,
      open.slice(1).map((key) => ({ key, value: "x" })),
      "answer",
    )
    expect(nextOpenBlank(one, first)).toBeNull()
    expect(nextOpenBlank(one)).toBe(first)
  })

  test("issueTarget sends blanks to the text and signer problems to the Signers tab", () => {
    expect(issueTarget({ code: "unresolved_variable", message: "x", variableKey: "term" })).toEqual(
      { kind: "blank", key: "term" },
    )
    expect(issueTarget({ code: "missing_name", message: "x", roleKey: "party_a" })).toEqual({
      kind: "signers",
      roleKey: "party_a",
    })
    expect(issueTarget({ code: "no_signers", message: "x" })).toEqual({ kind: "signers" })
    expect(issueTarget({ code: "invalid_structure", message: "x" })).toBeNull()
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

describe("starting points", () => {
  test("draftOrigin tells blank and imported drafts from starters", () => {
    expect(draftOrigin("blank")).toBe("blank")
    expect(draftOrigin("import")).toBe("import")
    expect(draftOrigin("mutual-nda")).toBe("starter")
  })

  test("importErrorMessage uses the API's reason, or a fallback by status", () => {
    expect(
      importErrorMessage({ status: 422, body: { error: "no_text", message: "No text here." } }),
    ).toBe("No text here.")
    expect(importErrorMessage({ status: 413, body: null })).toContain("10 MB")
    expect(importErrorMessage(new Error("network"))).toContain("couldn't be imported")
  })
})

describe("chat attachments", () => {
  test("images go as they are, documents as text; anything else is refused with a reason", () => {
    expect(chatAttachmentKind({ name: "id.png", type: "image/png", size: 10 })).toBe("image")
    expect(chatAttachmentKind({ name: "Terms.PDF", type: "application/pdf", size: 10 })).toBe(
      "document",
    )
    expect(chatAttachmentKind({ name: "a.docx", type: "", size: 10 })).toBe("document")
    expect(
      chatAttachmentKind({
        name: "big.png",
        type: "image/png",
        size: CHAT_ATTACHMENT_LIMITS.imageBytes + 1,
      }),
    ).toContain("5 MB")
    expect(
      chatAttachmentKind({ name: "a.exe", type: "application/x-msdownload", size: 1 }),
    ).toContain("attach a PDF")
  })

  test("textDataUrl keeps non-ASCII text intact", () => {
    const url = textDataUrl("Fee: KES 5,000 — Nairobi ✓")
    const base64 = url.split(",")[1] ?? ""
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe("Fee: KES 5,000 — Nairobi ✓")
  })
})

test("withoutEarlierImages keeps images only on the person's last message", () => {
  const img = (name: string) => ({
    type: "file",
    mediaType: "image/png",
    url: "data:x",
    filename: name,
  })
  const doc = { type: "file", mediaType: "text/plain", url: "data:y", filename: "t.txt" }
  type Part = { type: string; mediaType?: string; url?: string; filename?: string; text?: string }
  const messages: { role: string; parts: Part[] }[] = [
    { role: "user", parts: [img("a.png"), doc] },
    { role: "assistant", parts: [{ type: "text", text: "ok" }] },
    { role: "user", parts: [img("b.png")] },
  ]
  const out = withoutEarlierImages(messages)
  expect(out[0]?.parts).toEqual([{ type: "text", text: "[Image “a.png” attached, not kept]" }, doc])
  expect(out[2]?.parts).toEqual([img("b.png")])
})
