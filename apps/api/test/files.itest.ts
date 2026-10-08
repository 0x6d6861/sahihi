import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

// ADR 0038: All files (documents, envelopes and templates in one list)
let alice: Sender
let documentId: string

const json = async <T>(res: Response) => (await res.json()) as T

type Files = {
  items: { kind: string; id: string; permissions: Record<string, boolean> }[]
  total: number
  counts: { document: number; envelope: number; template: number }
  people: { id: string; name: string }[]
}

const files = async (sender: Sender, qs = "") =>
  json<Files>(await request(sender, `/api/files${qs ? `?${qs}` : ""}`))

async function createEnvelope(sender: Sender, title: string, folderId?: string) {
  const res = await request(sender, "/api/envelopes", {
    method: "POST",
    json: { documentId, title, folderId },
  })
  expect(res.status).toBe(201)
  return (await json<{ envelope: { id: string } }>(res)).envelope.id
}

async function createTemplate(sender: Sender, name: string) {
  const envelopeId = await createEnvelope(sender, `${name} source`)
  const put = await request(sender, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Otieno", email: "otieno@example.test", order: 1 }] },
  })
  const [recipient] = (await json<{ recipients: { id: string }[] }>(put)).recipients
  const res = await request(sender, "/api/templates", {
    method: "POST",
    json: { envelopeId, name, roles: [{ recipientId: recipient?.id, label: "Tenant" }] },
  })
  expect(res.status).toBe(201)
  return (await json<{ template: { id: string } }>(res)).template.id
}

/** Spread the rows over time so the merged order is known. */
async function setCreated(
  model: "document" | "envelope" | "template",
  id: string,
  day: number,
  hour = 0,
) {
  const createdAt = new Date(Date.UTC(2026, 0, day, hour))
  if (model === "document") await prisma.document.update({ where: { id }, data: { createdAt } })
  if (model === "envelope") await prisma.envelope.update({ where: { id }, data: { createdAt } })
  if (model === "template") await prisma.template.update({ where: { id }, data: { createdAt } })
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  documentId = (await uploadDocument(alice, undefined, "lease.pdf")).document.id
})

describe("GET /api/files", () => {
  test("one list of every type, newest first, with each type's row and permissions", async () => {
    const draft = await createEnvelope(alice, "Lease draft")
    const template = await createTemplate(alice, "Lease template")
    const source = (await prisma.template.findFirstOrThrow({ where: { id: template } })).name
    expect(source).toBe("Lease template")
    const envelopes = await prisma.envelope.findMany({ select: { id: true, title: true } })
    const sourceEnvelope = envelopes.find((e) => e.title === "Lease template source")?.id ?? ""
    await setCreated("document", documentId, 1)
    await setCreated("envelope", draft, 3)
    await setCreated("envelope", sourceEnvelope, 2)
    await setCreated("template", template, 4)

    const all = await files(alice)
    expect(all.items.map((i) => [i.kind, i.id])).toEqual([
      ["template", template],
      ["envelope", draft],
      ["envelope", sourceEnvelope],
      ["document", documentId],
    ])
    expect(all.counts).toEqual({ document: 1, envelope: 2, template: 1 })
    expect(all.total).toBe(4)
    expect(all.items[0]?.permissions).toEqual({ manage: true })
    expect(all.items[3]?.permissions).toEqual({ move: true, label: true, rename: true })
    expect(all.people.map((p) => p.id)).toEqual([alice.userId])
  })

  test("type and status narrow the list; a status implies its type", async () => {
    await createEnvelope(alice, "Lease draft")
    await createTemplate(alice, "NDA")

    expect((await files(alice, "type=template")).counts).toEqual({
      document: 0,
      envelope: 0,
      template: 1,
    })
    const drafts = await files(alice, "status=envelope:drafts")
    expect(drafts.items.every((i) => i.kind === "envelope")).toBe(true)
    expect(drafts.total).toBe(2)
    expect((await files(alice, "status=envelope:completed")).total).toBe(0)
    expect((await files(alice, "status=document:READY")).items.map((i) => i.kind)).toEqual([
      "document",
    ])
    expect((await files(alice, "type=template&status=document:READY")).total).toBe(0)
  })

  test("search and labels span every type and folder; without them one folder is listed", async () => {
    const folder = await request(alice, "/api/folders", {
      method: "POST",
      json: { name: "Acme" },
    })
    const acme = (await json<{ folder: { id: string } }>(folder)).folder.id
    const inAcme = await createEnvelope(alice, "Acme lease", acme)
    await request(alice, `/api/envelopes/${inAcme}/labels`, {
      method: "PATCH",
      json: { tags: ["Client"] },
    })

    expect((await files(alice)).items.map((i) => i.id)).not.toContain(inAcme)
    expect((await files(alice, `folderId=${acme}`)).items.map((i) => i.id)).toEqual([inAcme])
    expect((await files(alice, "tag=client")).items.map((i) => i.id)).toEqual([inAcme])
    // "lease" matches the document name, and envelopes through their document.
    const lease = await files(alice, "q=lease")
    expect(lease.counts).toEqual({ document: 1, envelope: 1, template: 0 })
  })

  test("pages merge the types without gaps or repeats", async () => {
    for (let i = 0; i < 30; i++) {
      const id = await createEnvelope(alice, `Envelope ${i}`)
      await setCreated("envelope", id, 2 + i)
    }
    // Midday on the 20th: after the envelope of the 20th, before the one of the 21st.
    await setCreated("document", documentId, 20, 12)
    const first = await files(alice)
    const second = await files(alice, "page=2")
    expect(first.items).toHaveLength(25)
    expect(second.items).toHaveLength(6)
    const ids = [...first.items, ...second.items].map((i) => i.id)
    expect(new Set(ids).size).toBe(31)
    expect(ids.indexOf(documentId)).toBe(11)
    expect((await request(alice, "/api/files?page=41")).status).toBe(400)
  })

  test("never lists another workspace's items or accepts its folder", async () => {
    const bob = await createSender("bob")
    await uploadDocument(bob)
    const folder = await request(bob, "/api/folders", { method: "POST", json: { name: "Bob" } })
    const bobs = (await json<{ folder: { id: string } }>(folder)).folder.id

    expect((await files(alice)).items.map((i) => i.id)).toEqual([documentId])
    expect((await request(alice, `/api/files?folderId=${bobs}`)).status).toBe(404)
  })
})
