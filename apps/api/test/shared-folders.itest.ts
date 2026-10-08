import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// ADR 0038: documents, envelopes and templates share folders and labels
let alice: Sender
let documentId: string

const json = async <T>(res: Response) => (await res.json()) as T

type Item = {
  id: string
  folder: { id: string; name: string } | null
  color: string | null
  tags: { name: string }[]
}
type List = { items: Item[]; total: number; tags: { name: string }[]; colors: string[] }

async function createFolder(sender: Sender, name: string, parentId?: string) {
  const res = await request(sender, "/api/folders", { method: "POST", json: { name, parentId } })
  expect(res.status).toBe(201)
  return (await json<{ folder: { id: string } }>(res)).folder.id
}

async function createEnvelope(sender: Sender, title: string, folderId?: string) {
  const res = await request(sender, "/api/envelopes", {
    method: "POST",
    json: { documentId, title, folderId },
  })
  expect(res.status).toBe(201)
  return (await json<{ envelope: { id: string } }>(res)).envelope.id
}

async function createTemplate(sender: Sender, name: string, folderId?: string) {
  const envelopeId = await createEnvelope(sender, `${name} source`)
  const put = await request(sender, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Otieno", email: "otieno@example.test", order: 1 }] },
  })
  const [recipient] = (await json<{ recipients: { id: string }[] }>(put)).recipients
  const res = await request(sender, "/api/templates", {
    method: "POST",
    json: {
      envelopeId,
      name,
      folderId,
      roles: [{ recipientId: recipient?.id, label: "Tenant" }],
    },
  })
  expect(res.status).toBe(201)
  return (await json<{ template: { id: string } }>(res)).template.id
}

const envelopes = async (sender: Sender, qs = "") =>
  json<List>(await request(sender, `/api/envelopes${qs ? `?${qs}` : ""}`))
const templates = async (sender: Sender, qs = "") =>
  json<List>(await request(sender, `/api/templates${qs ? `?${qs}` : ""}`))

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  documentId = (await uploadDocument(alice)).document.id
})

describe("shared folders", () => {
  test("envelopes and templates are created in a folder and listed per folder", async () => {
    const acme = await createFolder(alice, "Acme")
    const inAcme = await createEnvelope(alice, "Acme lease", acme)
    await createEnvelope(alice, "Root lease")
    const template = await createTemplate(alice, "Acme NDA", acme)

    const inside = await envelopes(alice, `folderId=${acme}`)
    expect(inside.items.map((e) => e.id)).toEqual([inAcme])
    expect(inside.items[0]?.folder).toEqual({ id: acme, name: "Acme" })
    // The root lists what isn't in a folder (two envelopes: "Root lease" and the template's source).
    expect((await envelopes(alice)).items.map((e) => e.id)).not.toContain(inAcme)
    expect((await templates(alice, `folderId=${acme}`)).items.map((t) => t.id)).toEqual([template])
    expect((await templates(alice)).total).toBe(0)

    // Search finds items in every folder.
    expect((await envelopes(alice, "q=acme")).items.map((e) => e.id)).toContain(inAcme)

    const folders = await json<{
      items: { id: string; documentCount: number; envelopeCount: number; templateCount: number }[]
    }>(await request(alice, "/api/folders"))
    expect(folders.items).toEqual([
      expect.objectContaining({ id: acme, documentCount: 0, envelopeCount: 1, templateCount: 1 }),
    ])
  })

  test("move and label an envelope in any status, without an audit event", async () => {
    const acme = await createFolder(alice, "Acme")
    const id = await createEnvelope(alice, "Lease")
    await prisma.envelope.update({ where: { id }, data: { status: "COMPLETED" } })
    const auditBefore = await prisma.auditEvent.count({ where: { envelopeId: id } })

    const res = await request(alice, `/api/envelopes/${id}/labels`, {
      method: "PATCH",
      json: { folderId: acme, color: "#1570d1", tags: ["Client", "client", "2026"] },
    })
    expect(res.status).toBe(200)
    const { envelope } = await json<{ envelope: Item & { folderId: string } }>(res)
    expect(envelope.folderId).toBe(acme)
    expect(envelope.color).toBe("#1570D1")
    expect(envelope.tags.map((t) => t.name)).toEqual(["2026", "Client"])
    expect(await prisma.auditEvent.count({ where: { envelopeId: id } })).toBe(auditBefore)

    const tagged = await envelopes(alice, "tag=client")
    expect(tagged.items.map((e) => e.id)).toEqual([id])
    expect(tagged.tags.map((t) => t.name)).toEqual(["2026", "Client"])
    expect(tagged.colors).toEqual(["#1570D1"])
    expect((await envelopes(alice, "color=1570D1")).total).toBe(1)

    const back = await request(alice, `/api/envelopes/${id}/labels`, {
      method: "PATCH",
      json: { folderId: null },
    })
    expect(back.status).toBe(200)
    expect((await envelopes(alice)).items.map((e) => e.id)).toContain(id)
  })

  test("move and label a template", async () => {
    const acme = await createFolder(alice, "Acme")
    const id = await createTemplate(alice, "NDA")
    const res = await request(alice, `/api/templates/${id}`, {
      method: "PATCH",
      json: { folderId: acme, tags: ["Legal"] },
    })
    expect(res.status).toBe(200)
    const listed = await templates(alice, "tag=legal")
    expect(listed.items).toEqual([
      expect.objectContaining({ id, folder: { id: acme, name: "Acme" } }),
    ])
  })

  test("a folder from another workspace is refused", async () => {
    const bob = await createSender("bob")
    const foreign = await createFolder(bob, "Bob's")
    const id = await createEnvelope(alice, "Lease")

    const move = await request(alice, `/api/envelopes/${id}/labels`, {
      method: "PATCH",
      json: { folderId: foreign },
    })
    expect(move.status).toBe(404)
    const create = await request(alice, "/api/envelopes", {
      method: "POST",
      json: { documentId, title: "x", folderId: foreign },
    })
    expect(create.status).toBe(404)
    expect((await request(alice, `/api/envelopes?folderId=${foreign}`)).status).toBe(404)
    expect((await request(alice, `/api/templates?folderId=${foreign}`)).status).toBe(404)
  })

  test("only the sender, an admin or the owner can move an envelope", async () => {
    const id = await createEnvelope(alice, "Lease")
    const member = await joinOrganization(alice, "member", "member")
    const res = await request(member, `/api/envelopes/${id}/labels`, {
      method: "PATCH",
      json: { color: "#1570D1" },
    })
    expect(res.status).toBe(403)
  })

  test("deleting a folder moves its envelopes and templates up to the parent", async () => {
    const acme = await createFolder(alice, "Acme")
    const leases = await createFolder(alice, "Leases", acme)
    const envelope = await createEnvelope(alice, "Lease", leases)
    const template = await createTemplate(alice, "NDA", leases)

    expect((await request(alice, `/api/folders/${leases}`, { method: "DELETE" })).status).toBe(204)

    expect((await prisma.envelope.findUniqueOrThrow({ where: { id: envelope } })).folderId).toBe(
      acme,
    )
    expect((await prisma.template.findUniqueOrThrow({ where: { id: template } })).folderId).toBe(
      acme,
    )
  })
})
