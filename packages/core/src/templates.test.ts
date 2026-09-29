import { describe, expect, test } from "bun:test"
import {
  defaultRoleLabels,
  draftFromTemplate,
  type EnvelopeRecipientForTemplate,
  SaveTemplateSchema,
  type TemplateForUse,
  templateRolesFromEnvelope,
  UpdateTemplateSchema,
} from "./templates"

const recipient = (
  id: string,
  over: Partial<EnvelopeRecipientForTemplate> = {},
): EnvelopeRecipientForTemplate => ({
  id,
  name: `Person ${id}`,
  email: `${id}@example.test`,
  phone: null,
  role: "SIGNER",
  order: 1,
  verification: "LINK",
  colorIndex: 0,
  ...over,
})

const template: TemplateForUse = {
  signingOrder: "SEQUENTIAL",
  roles: [
    {
      id: "r-tenant",
      label: "Tenant",
      role: "SIGNER",
      order: 1,
      verification: "SMS_OTP",
      colorIndex: 0,
      name: null,
      email: null,
      phone: null,
    },
    {
      id: "r-landlord",
      label: "Landlord",
      role: "SIGNER",
      order: 2,
      verification: "LINK",
      colorIndex: 1,
      name: "Wanjiru Kamau",
      email: "wanjiru@example.test",
      phone: null,
    },
    {
      id: "r-agent",
      label: "Agent",
      role: "VIEWER",
      order: 3,
      verification: "LINK",
      colorIndex: 2,
      name: null,
      email: null,
      phone: null,
    },
  ],
  fields: [
    {
      roleId: "r-tenant",
      type: "SIGNATURE",
      page: 1,
      x: 0.1,
      y: 0.8,
      width: 0.3,
      height: 0.05,
      required: true,
      label: null,
    },
    {
      roleId: "r-landlord",
      type: "SIGNATURE",
      page: 1,
      x: 0.6,
      y: 0.8,
      width: 0.3,
      height: 0.05,
      required: true,
      label: null,
    },
    {
      roleId: "r-agent",
      type: "TEXT",
      page: 1,
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.05,
      required: false,
      label: null,
    },
  ],
}

describe("saving", () => {
  test("default labels count per role type", () => {
    expect(
      defaultRoleLabels([
        { role: "SIGNER" },
        { role: "VIEWER" },
        { role: "SIGNER" },
        { role: "APPROVER" },
      ]),
    ).toEqual(["Signer 1", "Viewer 1", "Signer 2", "Approver 1"])
  })

  test("labels must differ (case-insensitive) and recipients appear once", () => {
    const bad = SaveTemplateSchema.safeParse({
      envelopeId: "e",
      name: "Lease",
      roles: [
        { recipientId: "a", label: "Tenant" },
        { recipientId: "a", label: "tenant" },
      ],
    })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues.map((i) => i.path.join("."))).toEqual([
      "roles.1.recipientId",
      "roles.1.label",
    ])
  })

  test("every recipient must get a role; contacts are kept only when asked", () => {
    const recipients = [
      recipient("a", { order: 1, verification: "EMAIL_OTP" }),
      recipient("b", { order: 2 }),
    ]
    expect(
      templateRolesFromEnvelope(recipients, [
        { recipientId: "a", label: "Tenant", keepContact: false },
      ]).ok,
    ).toBe(false)
    expect(
      templateRolesFromEnvelope(recipients, [
        { recipientId: "a", label: "Tenant", keepContact: false },
        { recipientId: "zzz", label: "Other", keepContact: false },
      ]).ok,
    ).toBe(false)

    const saved = templateRolesFromEnvelope(recipients, [
      { recipientId: "a", label: "Tenant", keepContact: false },
      { recipientId: "b", label: "Landlord", keepContact: true },
    ])
    if (!saved.ok) throw new Error(saved.message)
    expect(saved.roles).toEqual([
      {
        recipientId: "a",
        label: "Tenant",
        role: "SIGNER",
        order: 1,
        verification: "EMAIL_OTP",
        colorIndex: 0,
        name: null,
        email: null,
        phone: null,
      },
      {
        recipientId: "b",
        label: "Landlord",
        role: "SIGNER",
        order: 2,
        verification: "LINK",
        colorIndex: 0,
        name: "Person b",
        email: "b@example.test",
        phone: null,
      },
    ])
  })

  test("update needs something to change", () => {
    expect(UpdateTemplateSchema.safeParse({}).success).toBe(false)
    expect(UpdateTemplateSchema.safeParse({ description: null }).success).toBe(true)
  })
})

describe("draftFromTemplate", () => {
  const people = [
    { roleId: "r-tenant", name: " Otieno ", email: "OTIENO@example.test", phone: "+254712345678" },
    { roleId: "r-agent", name: "Amina", email: "amina@example.test" },
  ]

  test("fills roles from input and fixed contacts, keeps order for sequential signing", () => {
    const draft = draftFromTemplate(template, people)
    if (!draft.ok) throw new Error(JSON.stringify(draft.issues))
    expect(draft.recipients).toEqual([
      {
        roleId: "r-tenant",
        name: "Otieno",
        email: "otieno@example.test",
        phone: "+254712345678",
        role: "SIGNER",
        order: 1,
        verification: "SMS_OTP",
        colorIndex: 0,
        delivery: "EMAIL",
      },
      {
        roleId: "r-landlord",
        name: "Wanjiru Kamau",
        email: "wanjiru@example.test",
        phone: null,
        role: "SIGNER",
        order: 2,
        verification: "LINK",
        colorIndex: 1,
        delivery: "EMAIL",
      },
      {
        roleId: "r-agent",
        name: "Amina",
        email: "amina@example.test",
        phone: null,
        role: "VIEWER",
        order: 3,
        verification: "LINK",
        colorIndex: 2,
        delivery: "EMAIL",
      },
    ])
    // Viewers never own fields.
    expect(draft.fields.map((f) => f.roleId)).toEqual(["r-tenant", "r-landlord"])
  })

  test("parallel templates put everyone on step 1", () => {
    const draft = draftFromTemplate({ ...template, signingOrder: "PARALLEL" }, people)
    if (!draft.ok) throw new Error("expected ok")
    expect(draft.recipients.map((r) => r.order)).toEqual([1, 1, 1])
  })

  test("empty name and email get plain-language messages", () => {
    const res = draftFromTemplate(template, [
      { roleId: "r-tenant", name: "", email: "", phone: "+254712345678" },
      { roleId: "r-agent", name: "Amina", email: "amina@example.test" },
    ])
    expect(res.ok).toBe(false)
    if (!res.ok)
      expect(res.issues).toEqual([
        { path: "recipients.r-tenant.name", message: "Enter their name" },
        { path: "recipients.r-tenant.email", message: "Enter a valid email address" },
      ])
  })

  test("reports missing people, bad input, SMS without phone, duplicates and unknown roles by role", () => {
    const missing = draftFromTemplate(template, [])
    expect(missing.ok).toBe(false)
    if (!missing.ok)
      expect(missing.issues).toEqual([
        { path: "recipients.r-tenant", message: "Who is the Tenant?" },
        { path: "recipients.r-agent", message: "Who is the Agent?" },
      ])

    const bad = draftFromTemplate(template, [
      { roleId: "r-tenant", name: "Otieno", email: "otieno@example.test" }, // SMS needs a phone
      { roleId: "r-agent", name: "Amina", email: "WANJIRU@example.test" }, // same as the landlord
      { roleId: "r-ghost", name: "X", email: "x@example.test" },
    ])
    expect(bad.ok).toBe(false)
    if (!bad.ok)
      expect(bad.issues.map((i) => i.path)).toEqual([
        "recipients.r-ghost",
        "recipients.r-tenant.phone",
        "recipients.r-agent.email",
      ])
  })
})
