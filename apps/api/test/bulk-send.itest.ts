import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { processBulkSend } from "@sahihi/envelopes"
import { getQueues } from "@sahihi/infra"
import { app, createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

// docs/bulk-send.md
let alice: Sender
let templateId: string
let roleId: string

async function seedTemplate(sender: Sender) {
  const { document } = await uploadDocument(sender)
  const draft = await request(sender, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Offer" },
  })
  const { envelope } = (await draft.json()) as { envelope: { id: string } }
  const put = await request(sender, `/api/envelopes/${envelope.id}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "X", email: "x@example.test" }] },
  })
  const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  await request(sender, `/api/envelopes/${envelope.id}/fields`, {
    method: "PUT",
    json: {
      fields: [
        {
          recipientId: r?.id,
          type: "SIGNATURE",
          page: 1,
          x: 0.1,
          y: 0.1,
          width: 0.3,
          height: 0.06,
        },
      ],
    },
  })
  const saved = await request(sender, "/api/templates", {
    method: "POST",
    json: {
      envelopeId: envelope.id,
      name: "Offer letter",
      roles: [{ recipientId: r?.id, label: "Employee" }],
    },
  })
  const { template } = (await saved.json()) as { template: { id: string } }
  const detail = (await (await request(sender, `/api/templates/${template.id}`)).json()) as {
    template: { roles: { id: string }[] }
  }
  return { templateId: template.id, roleId: detail.template.roles[0]?.id as string }
}

const rows = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => ({
    recipients: [{ roleId, name: `Person ${from + i}`, email: `person${from + i}@example.test` }],
  }))

const start = (sender: Sender, body: unknown, tpl = templateId) =>
  request(sender, `/api/templates/${tpl}/bulk-sends`, { method: "POST", json: body })

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  ;({ templateId, roleId } = await seedTemplate(alice))
})

describe("bulk send", () => {
  test("one sent envelope per row, titled per row; row data cleared; audit links the batch", async () => {
    const res = await start(alice, { title: "Offer – {{Employee name}}", rows: rows(3) })
    expect(res.status).toBe(202)
    const { bulkSend } = (await res.json()) as { bulkSend: { id: string } }
    expect(await getQueues().maintenance.raw.getJob(`bulk-${bulkSend.id}`)).toBeTruthy()

    expect(await processBulkSend(bulkSend.id)).toEqual({ sent: 3, failed: 0 })
    const envelopes = await prisma.envelope.findMany({
      where: { organizationId: alice.organizationId, title: { startsWith: "Offer – " } },
      include: { recipients: true, auditEvents: { where: { type: "envelope.created" } } },
      orderBy: { title: "asc" },
    })
    expect(envelopes.map((e) => [e.title, e.status, e.recipients[0]?.email])).toEqual([
      ["Offer – Person 1", "SENT", "person1@example.test"],
      ["Offer – Person 2", "SENT", "person2@example.test"],
      ["Offer – Person 3", "SENT", "person3@example.test"],
    ])
    expect(envelopes[0]?.auditEvents[0]?.data).toMatchObject({ bulkSendId: bulkSend.id, row: 1 })

    const items = await prisma.bulkSendItem.findMany({ where: { bulkSendId: bulkSend.id } })
    expect(items.every((i) => i.status === "SENT" && i.recipients === null && i.envelopeId)).toBe(
      true,
    )
    const view = (await (await request(alice, `/api/bulk-sends/${bulkSend.id}`)).json()) as {
      bulkSend: { status: string; sent: number; items: Record<string, unknown>[] }
    }
    expect(view.bulkSend).toMatchObject({ status: "DONE", sent: 3 })
    expect(Object.keys(view.bulkSend.items[0] ?? {}).sort()).toEqual([
      "envelopeId",
      "error",
      "row",
      "status",
    ])
  })

  test("any invalid row → 400 with every row's issues; nothing created", async () => {
    const res = await start(alice, {
      title: "Offer",
      rows: [
        ...rows(1),
        { recipients: [{ roleId, name: "", email: "nope" }] },
        { recipients: [{ roleId, name: "Ok", email: "ok@example.test" }] },
      ],
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { issues: { path: string; row: number; message: string }[] }
    expect(body.issues).toEqual([
      { path: "rows.1", row: 2, message: "Employee: Enter their name" },
      { path: "rows.1", row: 2, message: "Employee: Enter a valid email address" },
    ])
    expect(await prisma.bulkSend.count()).toBe(0)
  })

  test("a batch bigger than the plan's remaining envelopes is refused up front", async () => {
    const free = await createSender("free", { plan: "free" })
    const t = await seedTemplate(free)
    roleId = t.roleId
    const res = await start(free, { title: "Offer", rows: rows(6) }, t.templateId)
    expect(res.status).toBe(402)
    expect(await prisma.bulkSend.count()).toBe(0)
  })

  test("a row that fails (quota reached meanwhile) is recorded; the batch continues", async () => {
    const free = await createSender("free", { plan: "free" })
    const t = await seedTemplate(free)
    roleId = t.roleId
    // 3 already sent this month → 2 left
    await prisma.envelope.updateMany({ where: { organizationId: free.organizationId }, data: {} })
    const docs = await prisma.document.findFirstOrThrow({
      where: { organizationId: free.organizationId },
    })
    for (let i = 0; i < 3; i++) {
      await prisma.envelope.create({
        data: {
          organizationId: free.organizationId,
          documents: { create: { documentId: docs.id } },
          createdById: free.userId,
          title: `Old ${i}`,
          status: "SENT",
          sentAt: new Date(),
        },
      })
    }
    const res = await start(free, { title: "Offer {{Employee name}}", rows: rows(2) }, t.templateId)
    const { bulkSend } = (await res.json()) as { bulkSend: { id: string } }
    // Someone else sends one before the batch runs.
    await prisma.envelope.create({
      data: {
        organizationId: free.organizationId,
        documents: { create: { documentId: docs.id } },
        createdById: free.userId,
        title: "Meanwhile",
        status: "SENT",
        sentAt: new Date(),
      },
    })
    expect(await processBulkSend(bulkSend.id)).toEqual({ sent: 1, failed: 1 })
    const failed = await prisma.bulkSendItem.findFirstOrThrow({
      where: { bulkSendId: bulkSend.id, status: "FAILED" },
    })
    expect(failed.error).toContain("envelopes a month")
    expect(failed.recipients).toBeNull()
  })

  test("template deleted before the batch runs: every row fails and the sender is told", async () => {
    const res = await start(alice, { title: "Offer", rows: rows(3) })
    const { bulkSend } = (await res.json()) as { bulkSend: { id: string } }
    await prisma.template.delete({ where: { id: templateId } })
    expect(await processBulkSend(bulkSend.id)).toMatchObject({ sent: 0, failed: 3 })
    const items = await prisma.bulkSendItem.findMany({ where: { bulkSendId: bulkSend.id } })
    expect(items.map((i) => [i.status, i.recipients])).toEqual([
      ["FAILED", null],
      ["FAILED", null],
      ["FAILED", null],
    ])
    const [note] = await prisma.notification.findMany({ where: { userId: alice.userId } })
    expect(note).toMatchObject({
      type: "bulk_send.finished",
      data: { bulkSendId: bulkSend.id, sent: 0, failed: 3 },
    })
  })

  test("a retry after a crash sends the existing draft instead of creating a duplicate", async () => {
    const res = await start(alice, { title: "Offer", rows: rows(1) })
    const { bulkSend } = (await res.json()) as { bulkSend: { id: string } }
    // Simulate: the draft was created, then the worker died before sending.
    const { document } = await uploadDocument(alice)
    const draft = await prisma.envelope.create({
      data: {
        organizationId: alice.organizationId,
        documents: { create: { documentId: document.id } },
        createdById: alice.userId,
        title: "Pre-created",
      },
      include: { documents: true },
    })
    await prisma.recipient.create({
      data: { envelopeId: draft.id, name: "P", email: "p@example.test" },
    })
    const r = await prisma.recipient.findFirstOrThrow({ where: { envelopeId: draft.id } })
    await prisma.field.create({
      data: {
        envelopeId: draft.id,
        envelopeDocumentId: draft.documents[0]?.id as string,
        recipientId: r.id,
        type: "SIGNATURE",
        page: 1,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.05,
      },
    })
    await prisma.bulkSendItem.updateMany({
      where: { bulkSendId: bulkSend.id },
      data: { envelopeId: draft.id },
    })
    const before = await prisma.envelope.count()
    expect(await processBulkSend(bulkSend.id)).toEqual({ sent: 1, failed: 0 })
    expect(await prisma.envelope.count()).toBe(before)
    expect((await prisma.envelope.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
      "SENT",
    )
  })

  test("public API; other workspaces get 404", async () => {
    const keyRes = await request(alice, "/api/api-keys", {
      method: "POST",
      json: { name: "HR", scopes: ["envelopes:write", "envelopes:read"] },
    })
    const { key } = (await keyRes.json()) as { key: string }
    const res = await app.request("/api/v1/bulk-sends", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ templateId, title: "Offer", rows: rows(2) }),
    })
    expect(res.status).toBe(202)
    const { bulkSend } = (await res.json()) as { bulkSend: { id: string } }
    await processBulkSend(bulkSend.id)
    const got = await app.request(`/api/v1/bulk-sends/${bulkSend.id}`, {
      headers: { authorization: `Bearer ${key}` },
    })
    expect(((await got.json()) as { bulkSend: { sent: number } }).bulkSend.sent).toBe(2)
    const created = await prisma.envelope.findFirstOrThrow({
      where: { title: "Offer", status: "SENT" },
      include: { auditEvents: true },
    })
    expect(created.auditEvents.find((e) => e.type === "envelope.sent")?.data).toMatchObject({
      via: "api",
    })

    const mallory = await createSender("mallory")
    expect((await request(mallory, `/api/bulk-sends/${bulkSend.id}`)).status).toBe(404)
    expect((await start(mallory, { title: "x", rows: rows(1) })).status).toBe(404)
  })
})
