import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { auth } from "../src/auth"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// docs/templates.md
let alice: Sender
let envelopeId: string
let documentId: string
const recipientIds = { tenant: "", landlord: "" }

type TemplateDetail = {
  template: {
    id: string
    name: string
    signingOrder: string
    roles: { id: string; label: string; order: number; email: string | null; name: string | null }[]
    fields: { roleId: string; type: string; page: number; x: number }[]
  }
  permissions: { manage: boolean }
}

const json = async <T>(res: Response) => (await res.json()) as T

async function saveTemplate(sender: Sender, name = "Lease") {
  const res = await request(sender, "/api/templates", {
    method: "POST",
    json: {
      envelopeId,
      name,
      roles: [
        { recipientId: recipientIds.tenant, label: "Tenant" },
        { recipientId: recipientIds.landlord, label: "Landlord", keepContact: true },
      ],
    },
  })
  expect(res.status).toBe(201)
  return (await json<{ template: { id: string } }>(res)).template.id
}

const detail = async (sender: Sender, id: string) =>
  json<TemplateDetail>(await request(sender, `/api/templates/${id}`))

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  const { document } = await uploadDocument(alice)
  documentId = document.id
  const created = await request(alice, "/api/envelopes", {
    method: "POST",
    json: {
      documentId,
      title: "Lease – Unit 4",
      signingOrder: "SEQUENTIAL",
      message: "Please sign",
    },
  })
  envelopeId = (await json<{ envelope: { id: string } }>(created)).envelope.id
  const put = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: {
      recipients: [
        { name: "Otieno", email: "otieno@example.test", order: 1, verification: "EMAIL_OTP" },
        { name: "Wanjiru Kamau", email: "wanjiru@example.test", order: 2 },
      ],
    },
  })
  const saved = (await json<{ recipients: { id: string; email: string }[] }>(put)).recipients
  recipientIds.tenant = saved.find((r) => r.email === "otieno@example.test")?.id ?? ""
  recipientIds.landlord = saved.find((r) => r.email === "wanjiru@example.test")?.id ?? ""
  await request(alice, `/api/envelopes/${envelopeId}/fields`, {
    method: "PUT",
    json: {
      fields: [
        {
          recipientId: recipientIds.tenant,
          type: "SIGNATURE",
          page: 1,
          x: 0.1,
          y: 0.8,
          width: 0.3,
          height: 0.05,
        },
        {
          recipientId: recipientIds.tenant,
          type: "DATE_SIGNED",
          page: 1,
          x: 0.1,
          y: 0.9,
          width: 0.2,
          height: 0.03,
        },
        {
          recipientId: recipientIds.landlord,
          type: "SIGNATURE",
          page: 1,
          x: 0.6,
          y: 0.8,
          width: 0.3,
          height: 0.05,
        },
      ],
    },
  })
})

describe("save as template", () => {
  test("copies roles (contacts only where kept), fields and settings; the envelope is untouched", async () => {
    const before = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { recipients: true, fields: true },
    })
    const id = await saveTemplate(alice)
    const { template, permissions } = await detail(alice, id)
    expect(permissions.manage).toBe(true)
    expect(template.signingOrder).toBe("SEQUENTIAL")
    expect(template.roles.map((r) => [r.label, r.order, r.name, r.email])).toEqual([
      ["Tenant", 1, null, null],
      ["Landlord", 2, "Wanjiru Kamau", "wanjiru@example.test"],
    ])
    const tenantRole = template.roles[0]?.id
    expect(template.fields.filter((f) => f.roleId === tenantRole)).toHaveLength(2)
    expect(template.fields).toHaveLength(3)
    expect(
      await prisma.envelope.findUniqueOrThrow({
        where: { id: envelopeId },
        include: { recipients: true, fields: true },
      }),
    ).toEqual(before)
  })

  test("every recipient must get a role", async () => {
    const res = await request(alice, "/api/templates", {
      method: "POST",
      json: {
        envelopeId,
        name: "Half",
        roles: [{ recipientId: recipientIds.tenant, label: "Tenant" }],
      },
    })
    expect(res.status).toBe(400)
  })
})

describe("use a template", () => {
  test("creates a DRAFT envelope with people filled in and fields copied, audited with the template", async () => {
    const id = await saveTemplate(alice)
    const { template } = await detail(alice, id)
    const tenant = template.roles.find((r) => r.label === "Tenant")
    const res = await request(alice, `/api/templates/${id}/envelopes`, {
      method: "POST",
      json: {
        title: "Lease – Unit 7",
        recipients: [{ roleId: tenant?.id, name: "Amina Hassan", email: "Amina@Example.test" }],
      },
    })
    expect(res.status).toBe(201)
    const { envelope } = await json<{ envelope: { id: string } }>(res)
    const created = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelope.id },
      include: {
        recipients: { orderBy: { order: "asc" } },
        fields: true,
        auditEvents: true,
      },
    })
    expect(created.status).toBe("DRAFT")
    expect(created.documentId).toBe(documentId)
    expect(created.message).toBe("Please sign")
    expect(created.recipients.map((r) => [r.name, r.email, r.order, r.verification])).toEqual([
      ["Amina Hassan", "amina@example.test", 1, "EMAIL_OTP"],
      ["Wanjiru Kamau", "wanjiru@example.test", 2, "LINK"],
    ])
    const amina = created.recipients[0]?.id
    expect(
      created.fields
        .filter((f) => f.recipientId === amina)
        .map((f) => f.type)
        .sort(),
    ).toEqual(["DATE_SIGNED", "SIGNATURE"])
    expect(
      created.auditEvents.map((e) => [e.type, (e.data as { templateId?: string }).templateId]),
    ).toEqual([["envelope.created", id]])
    // Ready to send as is.
    expect(
      (await request(alice, `/api/envelopes/${envelope.id}/send`, { method: "POST" })).status,
    ).toBe(200)
  })

  test("missing or invalid people come back per role", async () => {
    const id = await saveTemplate(alice)
    const res = await request(alice, `/api/templates/${id}/envelopes`, {
      method: "POST",
      json: { title: "Lease", recipients: [] },
    })
    expect(res.status).toBe(400)
    const body = await json<{ issues: { path: string; message: string }[] }>(res)
    const { template } = await detail(alice, id)
    expect(body.issues).toEqual([
      { path: `recipients.${template.roles[0]?.id}`, message: "Who is the Tenant?" },
    ])
  })
})

describe("permissions and lifecycle", () => {
  test("members use any template but rename/delete only their own; admins any", async () => {
    const id = await saveTemplate(alice)
    const bob = await joinOrganization(alice, "bob", "member")
    const carol = await joinOrganization(alice, "carol", "admin")

    expect((await detail(bob, id)).permissions.manage).toBe(false)
    const { template } = await detail(bob, id)
    const use = await request(bob, `/api/templates/${id}/envelopes`, {
      method: "POST",
      json: {
        title: "Bob's lease",
        recipients: [{ roleId: template.roles[0]?.id, name: "T", email: "t@example.test" }],
      },
    })
    expect(use.status).toBe(201)
    expect(
      (await request(bob, `/api/templates/${id}`, { method: "PATCH", json: { name: "Mine" } }))
        .status,
    ).toBe(403)
    expect((await request(bob, `/api/templates/${id}`, { method: "DELETE" })).status).toBe(403)
    expect(
      (
        await request(carol, `/api/templates/${id}`, {
          method: "PATCH",
          json: { name: "Standard lease" },
        })
      ).status,
    ).toBe(200)
    expect((await detail(alice, id)).template.name).toBe("Standard lease")
  })

  test("a document used by a template can't be deleted until the template is", async () => {
    const id = await saveTemplate(alice)
    const blocked = await request(alice, `/api/documents/${documentId}`, { method: "DELETE" })
    expect(blocked.status).toBe(409)
    expect((await request(alice, `/api/templates/${id}`, { method: "DELETE" })).status).toBe(204)
    expect(await prisma.templateField.count()).toBe(0)
    expect(await prisma.templateRole.count()).toBe(0)
    expect(
      (await request(alice, `/api/documents/${documentId}`, { method: "DELETE" })).status,
    ).toBe(204)
  })

  test("deleting the organization removes its templates", async () => {
    await saveTemplate(alice)
    await auth.api.deleteOrganization({
      body: { organizationId: alice.organizationId },
      headers: new Headers({ cookie: alice.cookie }),
    })
    expect(await prisma.template.count()).toBe(0)
  })
})
