import { describe, expect, test } from "bun:test"
import { ApiCreateFromDocumentSchema } from "../integrations/public-api"
import {
  applyRoleContacts,
  applyVariableUpdates,
  documentFields,
  numberSections,
  referencedVariableKeys,
  sectionForPrompt,
  structureIssues,
} from "./document"
import { envelopeDraftFromGenerated } from "./envelope"
import { GeneratedDocumentDataSchema, type Section, TextNodeSchema } from "./model"
import { generationPreflight } from "./preflight"
import { isValueAttested } from "./provenance"
import { AskQuestionsInputSchema, AskQuestionsResultSchema } from "./schemas"
import { findStarter, STARTERS } from "./starters"

const nda = () => {
  const starter = findStarter("mutual-nda")
  if (!starter) throw new Error("missing starter")
  return starter.build()
}

const filled = () => {
  const data = nda()
  const values = data.variables.map((v) => ({ key: v.key, value: `value of ${v.key}` }))
  return applyRoleContacts(applyVariableUpdates(data, values, "answer"), [
    { key: "party_a", name: "Amina Otieno", email: "amina@example.com" },
    { key: "party_b", name: "Brian Mwangi", email: "brian@example.org" },
  ])
}

describe("starters", () => {
  test.each(STARTERS.map((s) => [s.key, s] as const))("%s is valid and consistent", (_, s) => {
    const data = s.build()
    expect(GeneratedDocumentDataSchema.parse(data)).toEqual(data)
    expect(structureIssues(data)).toEqual([])
    // Every declared blank is used, and nothing is prefilled: the assistant must ask.
    expect(referencedVariableKeys(data.content).sort()).toEqual(
      data.variables.map((v) => v.key).sort(),
    )
    expect(data.variables.every((v) => v.value === null && v.status === "unresolved")).toBe(true)
    expect(data.roles.every((r) => r.name === null && r.email === null)).toBe(true)
  })

  test("build returns a fresh copy each time", () => {
    const a = nda()
    a.variables[0] = { ...a.variables[0], value: "x" } as (typeof a.variables)[number]
    expect(nda().variables[0]?.value).toBeNull()
  })
})

describe("document helpers", () => {
  test("numbers sections in order and skips unnumbered ones", () => {
    const data = nda()
    const first = data.content.content[0]
    if (first) first.attrs.numbered = false
    const numbers = numberSections(data.content)
    expect(numbers.get("parties")).toBeNull()
    expect(numbers.get("purpose")).toBe(1)
    expect(numbers.get("signatures")).toBe(data.content.content.length - 1)
  })

  test("lists fields with the role of their signature block", () => {
    const fields = documentFields(nda().content)
    expect(fields.map((f) => `${f.roleKey}:${f.field.fieldType}`)).toEqual([
      "party_a:SIGNATURE",
      "party_a:NAME",
      "party_a:DATE_SIGNED",
      "party_b:SIGNATURE",
      "party_b:NAME",
      "party_b:DATE_SIGNED",
    ])
  })

  test("prompt text shows blanks as keys, never as invented values", () => {
    const data = nda()
    const term = data.content.content.find((s) => s.attrs.id === "term")
    if (!term) throw new Error("no term section")
    expect(sectionForPrompt(term, 7)).toContain("continues for {{term}}")
    expect(sectionForPrompt(term, 7).startsWith("7. Term [id=term]")).toBe(true)
  })

  test("structure issues: unknown variable, unknown role, viewer with fields, duplicate ids", () => {
    const data = nda()
    data.variables = data.variables.filter((v) => v.key !== "purpose")
    data.roles = [{ ...(data.roles[0] as (typeof data.roles)[number]), recipientRole: "VIEWER" }]
    const dup = data.content.content[1]
    if (dup) dup.attrs.id = "parties"
    expect(structureIssues(data)).toEqual([
      { code: "unknown_variable", key: "purpose" },
      { code: "duplicate_id", id: "parties" },
      { code: "viewer_has_fields", roleKey: "party_a" },
      { code: "unknown_role", roleKey: "party_b" },
    ])
  })
})

describe("applyVariableUpdates", () => {
  test("answers set the value and source; skips mark the blank skipped", () => {
    const data = applyVariableUpdates(
      nda(),
      [
        { key: "governing_law", value: "Kenya" },
        { key: "purpose", value: null },
      ],
      "answer",
    )
    const law = data.variables.find((v) => v.key === "governing_law")
    const purpose = data.variables.find((v) => v.key === "purpose")
    expect(law).toMatchObject({ value: "Kenya", status: "answered", source: "answer" })
    expect(purpose).toMatchObject({ value: null, status: "skipped" })
  })

  test("skipping a blank that already has a value keeps the value", () => {
    const once = applyVariableUpdates(nda(), [{ key: "term", value: "one year" }], "chat")
    const twice = applyVariableUpdates(once, [{ key: "term", value: null }], "answer")
    expect(twice.variables.find((v) => v.key === "term")).toMatchObject({
      value: "one year",
      status: "answered",
    })
  })

  test("refuses unknown keys instead of ignoring them", () => {
    expect(() => applyVariableUpdates(nda(), [{ key: "nope", value: "x" }], "edit")).toThrow(
      'Unknown variable "nope"',
    )
  })

  test("does not mutate its input", () => {
    const data = nda()
    applyVariableUpdates(data, [{ key: "term", value: "one year" }], "chat")
    expect(data.variables.find((v) => v.key === "term")?.value).toBeNull()
  })
})

describe("generationPreflight", () => {
  test("a fresh starter lists every blank and every missing contact", () => {
    const codes = generationPreflight(nda()).map((i) => i.code)
    expect(codes.filter((c) => c === "unresolved_variable")).toHaveLength(9)
    expect(codes.filter((c) => c === "missing_name")).toHaveLength(2)
    expect(codes.filter((c) => c === "invalid_email")).toHaveLength(2)
  })

  test("a complete document passes", () => {
    expect(generationPreflight(filled())).toEqual([])
  })

  test("skipped blanks still block, with their own message", () => {
    const skipped = applyVariableUpdates(
      applyRoleContacts(nda(), [
        { key: "party_a", name: "A", email: "a@example.com" },
        { key: "party_b", name: "B", email: "b@example.com" },
      ]),
      [{ key: "purpose", value: null }],
      "answer",
    )
    const issue = generationPreflight(skipped).find((i) => i.variableKey === "purpose")
    expect(issue?.message).toBe('"Purpose of the disclosure" was skipped. Fill it in.')
  })

  test("signers need distinct, valid emails (case-insensitive)", () => {
    const data = applyRoleContacts(filled(), [
      { key: "party_b", name: "Peter Kamau", email: "AMINA@example.com" },
    ])
    expect(generationPreflight(data)).toEqual([
      {
        code: "duplicate_email",
        message: "Same email as First party. Each signer needs their own.",
        roleKey: "party_b",
      },
    ])
    const bad = applyRoleContacts(filled(), [{ key: "party_a", name: "A", email: "not-an-email" }])
    expect(generationPreflight(bad).map((i) => i.code)).toEqual(["invalid_email"])
  })

  test("a signer without a signature field is reported", () => {
    const data = filled()
    const sig = data.content.content.find((s) => s.attrs.id === "signatures")
    const block = sig?.content[2]
    if (block?.type === "signatureBlock") {
      block.content = block.content.filter(
        (c) => c.type !== "field" || c.attrs.fieldType !== "SIGNATURE",
      )
    }
    expect(generationPreflight(data).map((i) => `${i.code}:${i.roleKey}`)).toEqual([
      "missing_signature_field:party_b",
    ])
  })
})

describe("isValueAttested", () => {
  const said = ["The NDA is with Peter Kamau, governed by Kenyan law.", "One year"]

  test("accepts what the person said, ignoring case, spacing and edge punctuation", () => {
    expect(isValueAttested("Peter  Kamau", said)).toBe(true)
    expect(isValueAttested("one year.", said)).toBe(true)
    expect(isValueAttested("“One year”", said)).toBe(true)
  })

  test("refuses anything they didn't say", () => {
    expect(isValueAttested("Kenya", said)).toBe(false) // "Kenyan" ≠ "Kenya": ask instead
    expect(isValueAttested("two years", said)).toBe(false)
    expect(isValueAttested("  ", said)).toBe(false)
    expect(isValueAttested("anything", [])).toBe(false)
  })
})

describe("question schemas", () => {
  const q = (id: string) => ({ id, variableKey: "term", question: "How long?" })

  test("at most three questions per batch, four options each", () => {
    expect(AskQuestionsInputSchema.safeParse({ questions: [q("a"), q("b"), q("c")] }).success).toBe(
      true,
    )
    expect(
      AskQuestionsInputSchema.safeParse({ questions: [q("a"), q("b"), q("c"), q("d")] }).success,
    ).toBe(false)
    expect(
      AskQuestionsInputSchema.safeParse({
        questions: [{ ...q("a"), options: ["1", "2", "3", "4", "5"] }],
      }).success,
    ).toBe(false)
  })

  test("a result can skip (null) or dismiss", () => {
    expect(AskQuestionsResultSchema.parse({ answers: [{ questionId: "a", value: null }] })).toEqual(
      { dismissed: false, answers: [{ questionId: "a", value: null }] },
    )
    expect(AskQuestionsResultSchema.parse({ dismissed: true })).toEqual({
      dismissed: true,
      answers: [],
    })
  })
})

describe("envelopeDraftFromGenerated", () => {
  const page = { x: 0, y: 0, width: 600, height: 800, rotation: 0 as const }

  test("roles become recipients in order; rects become normalized top-left fields", () => {
    const draft = envelopeDraftFromGenerated(
      filled(),
      [
        {
          roleKey: "party_b",
          fieldType: "SIGNATURE",
          required: true,
          label: "Signature",
          page: 2,
          rect: { x: 60, y: 560, width: 180, height: 40 },
        },
      ],
      [page, page],
    )
    expect(draft.recipients.map((r) => [r.name, r.email, r.role])).toEqual([
      ["Amina Otieno", "amina@example.com", "SIGNER"],
      ["Brian Mwangi", "brian@example.org", "SIGNER"],
    ])
    expect(draft.fields).toEqual([
      {
        recipient: 1,
        document: 0,
        type: "SIGNATURE",
        page: 2,
        required: true,
        label: "Signature",
        x: 0.1,
        y: 0.25,
        width: 0.3,
        height: 0.05,
      },
    ])
    // The result satisfies the envelope service's own validator.
    expect(
      ApiCreateFromDocumentSchema.safeParse({ title: "t", documentIds: ["d"], ...draft }).success,
    ).toBe(true)
  })

  test("refuses fields for unknown roles or pages", () => {
    const f = {
      roleKey: "nobody",
      fieldType: "SIGNATURE" as const,
      required: true,
      label: undefined,
      page: 1,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    }
    expect(() => envelopeDraftFromGenerated(filled(), [f], [page])).toThrow('Unknown role "nobody"')
    expect(() =>
      envelopeDraftFromGenerated(filled(), [{ ...f, roleKey: "party_a", page: 3 }], [page]),
    ).toThrow("Field on missing page 3")
  })
})

describe("tables and italics", () => {
  const cell = (text: string, type: "tableCell" | "tableHeader" = "tableCell") => ({
    type,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })
  const withTable = (rows: ReturnType<typeof cell>[][]) => {
    const data = nda()
    const purpose = data.content.content.find((s) => s.attrs.id === "purpose")
    const parsed = GeneratedDocumentDataSchema.parse({
      ...data,
      content: {
        ...data.content,
        content: data.content.content.map((s) =>
          s === purpose
            ? {
                ...s,
                content: [
                  ...s.content,
                  {
                    type: "table",
                    content: rows.map((r) => ({ type: "tableRow", content: r })),
                  },
                ],
              }
            : s,
        ),
      },
    })
    return parsed
  }

  test("tables parse with editor defaults, and blanks inside cells count as used", () => {
    const data = withTable([[cell("Item", "tableHeader"), cell("Amount", "tableHeader")]])
    const purpose = data.content.content.find((s) => s.attrs.id === "purpose")
    const table = purpose?.content.at(-1)
    expect(table?.type).toBe("table")
    if (table?.type === "table") {
      expect(table.content[0]?.content[0]?.attrs).toEqual({
        colspan: 1,
        rowspan: 1,
        colwidth: null,
      })
      table.content[0]?.content[0]?.content[0]?.content.push({
        type: "variable",
        attrs: { key: "term" },
      })
    }
    expect(referencedVariableKeys(data.content)).toContain("term")
    expect(sectionForPrompt(purpose as Section, 2)).toContain("| Item{{term}} | Amount |")
  })

  test("merged cells are refused and ragged rows reported", () => {
    const data = nda()
    expect(
      GeneratedDocumentDataSchema.safeParse({
        ...data,
        content: {
          type: "doc",
          content: [
            {
              type: "section",
              attrs: { id: "s", title: "S" },
              content: [
                {
                  type: "table",
                  content: [
                    { type: "tableRow", content: [{ ...cell("a"), attrs: { colspan: 2 } }] },
                  ],
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false)
    const ragged = withTable([[cell("a"), cell("b")], [cell("c")]])
    expect(structureIssues(ragged)).toEqual([{ code: "ragged_table", sectionId: "purpose" }])
  })

  test("italic is a mark", () => {
    expect(
      TextNodeSchema.safeParse({ type: "text", text: "x", marks: [{ type: "italic" }] }).success,
    ).toBe(true)
  })
})
