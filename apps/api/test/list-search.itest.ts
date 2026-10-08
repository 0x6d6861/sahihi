import { beforeEach, describe, expect, test } from "bun:test"
import { ENVELOPES_PAGE_SIZE } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
})

async function draft(sender: Sender, title: string, documentName = "doc.pdf") {
  const { document } = await uploadDocument(sender, undefined, documentName)
  const res = await request(sender, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title, signingOrder: "PARALLEL" },
  })
  return ((await res.json()) as { envelope: { id: string } }).envelope.id
}

type EnvelopeList = {
  items: { id: string; title: string; thumbnailUrl: string | null; document: object }[]
  total: number
  page: number
  pageSize: number
  senders: { id: string }[]
}
const envelopes = async (who: Sender, query = "") =>
  (await (await request(who, `/api/envelopes${query}`)).json()) as EnvelopeList

describe("envelopes list (ADR 0036)", () => {
  test("search matches the title, the document name and a recipient's name or email", async () => {
    const lease = await draft(alice, "Lease Kilimani")
    const nda = await draft(alice, "Supplier agreement", "nda-mombasa.pdf")
    const third = await draft(alice, "Offer letter")
    await request(alice, `/api/envelopes/${third}/recipients`, {
      method: "PUT",
      json: { recipients: [{ name: "Achieng Otieno", email: "achieng@example.com", order: 1 }] },
    })

    expect((await envelopes(alice, "?q=kilimani")).items.map((e) => e.id)).toEqual([lease])
    expect((await envelopes(alice, "?q=MOMBASA")).items.map((e) => e.id)).toEqual([nda])
    expect((await envelopes(alice, "?q=otieno")).items.map((e) => e.id)).toEqual([third])
    expect((await envelopes(alice, "?q=achieng%40example")).items.map((e) => e.id)).toEqual([third])
  })

  test("the stage filter groups statuses; sender and period narrow", async () => {
    const a = await draft(alice, "A")
    const b = await draft(alice, "B")
    await prisma.envelope.update({ where: { id: b }, data: { status: "IN_PROGRESS" } })
    const c = await draft(alice, "C")
    await prisma.envelope.update({ where: { id: c }, data: { status: "VOIDED" } })

    expect((await envelopes(alice, "?stage=drafts")).items.map((e) => e.id)).toEqual([a])
    expect((await envelopes(alice, "?stage=active")).items.map((e) => e.id)).toEqual([b])
    expect((await envelopes(alice, "?stage=closed")).items.map((e) => e.id)).toEqual([c])
    expect((await envelopes(alice, `?senderId=${alice.userId}`)).total).toBe(3)
    expect((await envelopes(alice, "?senderId=someone-else")).total).toBe(0)
    expect((await envelopes(alice, "?period=7d")).total).toBe(3)
    expect((await request(alice, "/api/envelopes?stage=SENT")).status).toBe(400)
  })

  test("pages newest first and lists who sent envelopes", async () => {
    await prisma.envelope.createMany({
      data: Array.from({ length: ENVELOPES_PAGE_SIZE + 2 }, (_, i) => ({
        organizationId: alice.organizationId,
        createdById: alice.userId,
        title: `E${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      })),
    })
    const first = await envelopes(alice)
    expect(first.total).toBe(ENVELOPES_PAGE_SIZE + 2)
    expect(first.items).toHaveLength(ENVELOPES_PAGE_SIZE)
    expect(first.items[0]?.title).toBe(`E${ENVELOPES_PAGE_SIZE + 1}`)
    expect((await envelopes(alice, "?page=2")).items.map((e) => e.title)).toEqual(["E1", "E0"])
    expect(first.senders.map((s) => s.id)).toEqual([alice.userId])
    // The storage key never leaves the API; only the presigned URL (null until rendered).
    expect(first.items[0]?.thumbnailUrl).toBeNull()
    expect(first.items[0]?.document).not.toHaveProperty("thumbnailKey")
  })

  test("another workspace sees nothing, even when it searches", async () => {
    await draft(alice, "Lease Kilimani")
    expect((await envelopes(bob)).total).toBe(0)
    expect((await envelopes(bob, "?q=lease")).total).toBe(0)
    expect((await envelopes(bob)).senders).toEqual([])
  })
})

type TemplateList = {
  items: { id: string; name: string; document: object }[]
  total: number
  savers: { id: string }[]
}
const templates = async (who: Sender, query = "") =>
  (await (await request(who, `/api/templates${query}`)).json()) as TemplateList

async function template(sender: Sender, name: string, description?: string, documentName?: string) {
  const { document } = await uploadDocument(sender, undefined, documentName)
  return (
    await prisma.template.create({
      data: {
        organizationId: sender.organizationId,
        documents: { create: { documentId: document.id } },
        createdById: sender.userId,
        name,
        description,
      },
    })
  ).id
}

describe("templates list (ADR 0036)", () => {
  test("search matches the name, the description and the document name", async () => {
    const lease = await template(alice, "Residential lease")
    const nda = await template(alice, "Supplier", "Mutual NDA for vendors")
    const offer = await template(alice, "Offer", undefined, "employment-offer.pdf")
    expect((await templates(alice, "?q=lease")).items.map((t) => t.id)).toEqual([lease])
    expect((await templates(alice, "?q=nda")).items.map((t) => t.id)).toEqual([nda])
    expect((await templates(alice, "?q=EMPLOYMENT")).items.map((t) => t.id)).toEqual([offer])
  })

  test("saved by and period narrow; savers are listed; other workspaces see nothing", async () => {
    await template(alice, "Lease")
    const list = await templates(alice, `?createdById=${alice.userId}&period=30d`)
    expect(list.total).toBe(1)
    expect(list.savers.map((s) => s.id)).toEqual([alice.userId])
    expect(list.items[0]?.document).not.toHaveProperty("thumbnailKey")
    expect((await templates(alice, "?createdById=nobody")).total).toBe(0)
    expect((await templates(bob, "?q=lease")).total).toBe(0)
    expect((await request(alice, "/api/templates?period=2y")).status).toBe(400)
  })
})
