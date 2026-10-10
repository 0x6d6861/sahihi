import { describe, expect, test } from "bun:test"
import {
  applyRoleContacts,
  applyVariableUpdates,
  documentFields,
  referencedVariableKeys,
  structureIssues,
} from "./document"
import { GeneratedDocumentDataSchema } from "./model"
import { CreateGeneratedDocumentSchema } from "./schemas"
import { findStarter } from "./starters"
import { TemplateKeepError, templateDataFrom } from "./templates"

const filledOffer = () => {
  const data = findStarter("offer-letter")?.build()
  if (!data) throw new Error("missing starter")
  return applyRoleContacts(
    applyVariableUpdates(
      data,
      data.variables.map((v) => ({ key: v.key, value: `${v.label} value` })),
      "answer",
    ),
    [
      { key: "employer", name: "Wanjiru Kariuki", email: "hr@acme.co.ke" },
      { key: "candidate", name: "Otieno Ouma", email: "otieno@example.com" },
    ],
  )
}

describe("templateDataFrom", () => {
  test("clears values and contacts unless kept", () => {
    const data = filledOffer()
    const t = templateDataFrom(data, {
      keepValues: ["employer_name"],
      keepContacts: ["employer"],
    })
    expect(t.variables.find((v) => v.key === "employer_name")).toMatchObject({
      value: "Employer's name value",
      status: "answered",
      source: "template",
    })
    expect(
      t.variables.filter((v) => v.key !== "employer_name").every((v) => v.value === null),
    ).toBe(true)
    expect(t.variables.every((v) => v.key === "employer_name" || v.status === "unresolved")).toBe(
      true,
    )
    expect(t.roles.map((r) => [r.key, r.name, r.email])).toEqual([
      ["employer", "Wanjiru Kariuki", "hr@acme.co.ke"],
      ["candidate", null, null],
    ])
    expect(GeneratedDocumentDataSchema.parse(t)).toEqual(t)
  })

  test("keeps the text, signers and fields as they are", () => {
    const data = filledOffer()
    const t = templateDataFrom(data, { keepValues: [], keepContacts: [] })
    expect(t.content).toEqual(data.content)
    expect(t.title).toBe(data.title)
    expect(documentFields(t.content)).toEqual(documentFields(data.content))
    expect(t.roles.map((r) => r.label)).toEqual(data.roles.map((r) => r.label))
    expect(structureIssues(t)).toEqual([])
  })

  test("drops blanks the text no longer uses", () => {
    const data = filledOffer()
    data.variables.push({
      key: "unused",
      label: "Unused",
      type: "text",
      value: "x",
      status: "answered",
    })
    const t = templateDataFrom(data, { keepValues: [], keepContacts: [] })
    expect(t.variables.map((v) => v.key).sort()).toEqual(referencedVariableKeys(t.content).sort())
    expect(() => templateDataFrom(data, { keepValues: ["unused"], keepContacts: [] })).toThrow(
      TemplateKeepError,
    )
  })

  test("refuses to keep what isn't there", () => {
    const data = findStarter("offer-letter")?.build()
    if (!data) throw new Error("missing starter")
    expect(() => templateDataFrom(data, { keepValues: ["salary"], keepContacts: [] })).toThrow(
      TemplateKeepError,
    )
    expect(() => templateDataFrom(data, { keepValues: [], keepContacts: ["employer"] })).toThrow(
      TemplateKeepError,
    )
    expect(() => templateDataFrom(data, { keepValues: ["nope"], keepContacts: [] })).toThrow(
      TemplateKeepError,
    )
  })

  test("doesn't change the document it came from", () => {
    const data = filledOffer()
    const before = structuredClone(data)
    templateDataFrom(data, { keepValues: ["salary"], keepContacts: ["employer"] })
    expect(data).toEqual(before)
  })
})

test("a document starts from a starter or a template, not both", () => {
  expect(CreateGeneratedDocumentSchema.safeParse({ starter: "mutual-nda" }).success).toBe(true)
  expect(CreateGeneratedDocumentSchema.safeParse({ templateId: "t1" }).success).toBe(true)
  expect(
    CreateGeneratedDocumentSchema.safeParse({ starter: "mutual-nda", templateId: "t1" }).success,
  ).toBe(false)
  expect(CreateGeneratedDocumentSchema.safeParse({}).success).toBe(false)
})
