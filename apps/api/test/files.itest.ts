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

// ADR 0039: drag and drop and multi-select move many items at once
describe("POST /api/files/move", () => {
  async function createFolder(sender: Sender, name: string, parentId?: string) {
    const res = await request(sender, "/api/folders", { method: "POST", json: { name, parentId } })
    expect(res.status).toBe(201)
    return (await json<{ folder: { id: string } }>(res)).folder.id
  }
  const move = (sender: Sender, items: { kind: string; id: string }[], folderId: string | null) =>
    request(sender, "/api/files/move", { method: "POST", json: { items, folderId } })
  const where = async () => ({
    document: (await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).folderId,
  })

  test("moves every kind into a folder and back to the root, reporting where each was", async () => {
    const envelope = await createEnvelope(alice, "Lease draft")
    const template = await createTemplate(alice, "Lease template")
    const from = await createFolder(alice, "From")
    const sub = await createFolder(alice, "Sub", from)
    const to = await createFolder(alice, "To")
    await request(alice, `/api/documents/${documentId}`, {
      method: "PATCH",
      json: { folderId: from },
    })
    const items = [
      { kind: "document", id: documentId },
      { kind: "envelope", id: envelope },
      { kind: "template", id: template },
      { kind: "folder", id: sub },
    ]

    const res = await move(alice, items, to)
    expect(res.status).toBe(200)
    const body = await json<{
      moved: number
      from: { kind: string; id: string; folderId: string | null }[]
    }>(res)
    expect(body.moved).toBe(4)
    expect(body.from).toContainEqual({ kind: "document", id: documentId, folderId: from })
    expect(body.from).toContainEqual({ kind: "folder", id: sub, folderId: from })
    expect(body.from).toContainEqual({ kind: "envelope", id: envelope, folderId: null })
    expect(await where()).toEqual({ document: to })
    expect((await prisma.envelope.findUniqueOrThrow({ where: { id: envelope } })).folderId).toBe(to)
    expect((await prisma.template.findUniqueOrThrow({ where: { id: template } })).folderId).toBe(to)
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: sub } })).parentId).toBe(to)

    expect((await move(alice, items, null)).status).toBe(200)
    expect(await where()).toEqual({ document: null })
  })

  test("things picked along with a folder they're in travel with it, not out of it", async () => {
    const outer = await createFolder(alice, "Outer")
    const inner = await createFolder(alice, "Inner", outer)
    const target = await createFolder(alice, "Target")
    await request(alice, `/api/documents/${documentId}`, {
      method: "PATCH",
      json: { folderId: inner },
    })
    const res = await move(
      alice,
      [
        { kind: "folder", id: outer },
        { kind: "folder", id: inner },
        { kind: "document", id: documentId },
      ],
      target,
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as { moved: number }).moved).toBe(1)
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: outer } })).parentId).toBe(target)
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: inner } })).parentId).toBe(outer)
    expect(await where()).toEqual({ document: inner })
  })

  test("refuses a folder into its own subtree, and moves nothing", async () => {
    const a = await createFolder(alice, "A")
    const b = await createFolder(alice, "B", a)
    const res = await move(
      alice,
      [
        { kind: "document", id: documentId },
        { kind: "folder", id: a },
      ],
      b,
    )
    expect(res.status).toBe(400)
    expect(await where()).toEqual({ document: null })
  })

  test("refuses a folder name already taken in the target, and two moved folders sharing a name", async () => {
    const target = await createFolder(alice, "Target")
    await createFolder(alice, "Leases", target)
    const leases = await createFolder(alice, "leases")
    expect((await move(alice, [{ kind: "folder", id: leases }], target)).status).toBe(409)

    const x = await createFolder(alice, "X")
    const y = await createFolder(alice, "Y")
    await createFolder(alice, "Same", x)
    await createFolder(alice, "Same", y)
    const sames = await prisma.folder.findMany({ where: { name: "Same" }, select: { id: true } })
    const items = sames.map((f) => ({ kind: "folder", id: f.id }))
    expect((await move(alice, items, null)).status).toBe(409)
  })

  test("a member moves only their own items: one refusal moves nothing", async () => {
    const member = await joinOrganization(alice, "member", "member")
    const theirs = (await uploadDocument(member, undefined, "mine.pdf")).document.id
    const folder = await createFolder(member, "Member folder")
    const res = await move(
      member,
      [
        { kind: "document", id: theirs },
        { kind: "document", id: documentId },
      ],
      folder,
    )
    expect(res.status).toBe(403)
    expect((await prisma.document.findUniqueOrThrow({ where: { id: theirs } })).folderId).toBeNull()
    expect((await move(member, [{ kind: "document", id: theirs }], folder)).status).toBe(200)
  })

  test("never touches another workspace's items or folders", async () => {
    const bob = await createSender("bob")
    const bobsDoc = (await uploadDocument(bob)).document.id
    const bobsFolder = await createFolder(bob, "Bob")
    const mine = await createFolder(alice, "Mine")

    expect((await move(alice, [{ kind: "document", id: documentId }], bobsFolder)).status).toBe(404)
    expect((await move(alice, [{ kind: "document", id: bobsDoc }], mine)).status).toBe(404)
    expect((await move(alice, [{ kind: "folder", id: bobsFolder }], mine)).status).toBe(404)
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: bobsDoc } })).folderId,
    ).toBeNull()
  })
})

// ADR 0039: drop one item onto a file to put both in a new folder
describe("POST /api/files/group", () => {
  async function createFolder(sender: Sender, name: string, parentId?: string) {
    const res = await request(sender, "/api/folders", { method: "POST", json: { name, parentId } })
    expect(res.status).toBe(201)
    return (await json<{ folder: { id: string } }>(res)).folder.id
  }
  const group = (sender: Sender, items: { kind: string; id: string }[], parentId: string | null) =>
    request(sender, "/api/files/group", { method: "POST", json: { items, parentId } })
  type Grouped = { folder: { id: string; name: string; parentId: string | null } }

  test("makes “New folder”, then “New folder 2”, in the parent, holding every item", async () => {
    const parent = await createFolder(alice, "Clients")
    const envelope = await createEnvelope(alice, "Lease draft", parent)
    await request(alice, `/api/documents/${documentId}`, {
      method: "PATCH",
      json: { folderId: parent },
    })
    const items = [
      { kind: "document", id: documentId },
      { kind: "envelope", id: envelope },
    ]

    const res = await group(alice, items, parent)
    expect(res.status).toBe(201)
    const { folder } = await json<Grouped>(res)
    expect(folder).toMatchObject({ name: "New folder", parentId: parent })
    expect((await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).folderId).toBe(
      folder.id,
    )
    expect((await prisma.envelope.findUniqueOrThrow({ where: { id: envelope } })).folderId).toBe(
      folder.id,
    )

    const again = await json<Grouped>(await group(alice, items, parent))
    expect(again.folder.name).toBe("New folder 2")
  })

  test("refuses a folder grouped into its own subtree, and creates nothing", async () => {
    const outer = await createFolder(alice, "Outer")
    await request(alice, `/api/documents/${documentId}`, {
      method: "PATCH",
      json: { folderId: outer },
    })
    const res = await group(
      alice,
      [
        { kind: "document", id: documentId },
        { kind: "folder", id: outer },
      ],
      outer,
    )
    expect(res.status).toBe(400)
    expect(await prisma.folder.count({ where: { name: "New folder" } })).toBe(0)
  })

  test("a member can't group someone else's item; another workspace's items are unknown", async () => {
    const member = await joinOrganization(alice, "member", "member")
    const theirs = (await uploadDocument(member, undefined, "mine.pdf")).document.id
    const items = [
      { kind: "document", id: theirs },
      { kind: "document", id: documentId },
    ]
    expect((await group(member, items, null)).status).toBe(403)

    const bob = await createSender("bob")
    const bobs = (await uploadDocument(bob)).document.id
    const mixed = [
      { kind: "document", id: documentId },
      { kind: "document", id: bobs },
    ]
    expect((await group(alice, mixed, null)).status).toBe(404)
    expect(await prisma.folder.count()).toBe(0)
  })

  test("needs two items", async () => {
    expect((await group(alice, [{ kind: "document", id: documentId }], null)).status).toBe(400)
  })
})
