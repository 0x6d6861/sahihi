import { beforeEach, describe, expect, test } from "bun:test"
import { MAX_FOLDER_DEPTH } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import {
  createSender,
  joinOrganization,
  minimalPdf,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// ADR 0022: folders on the Documents page
let alice: Sender

const json = async <T>(res: Response) => (await res.json()) as T

type FolderList = {
  folder: { id: string; name: string } | null
  path: { id: string; name: string }[]
  items: {
    id: string
    name: string
    documentCount: number
    folderCount: number
    permissions: { manage: boolean }
  }[]
}
type DocumentList = {
  items: {
    id: string
    name: string
    folder: { id: string } | null
    permissions: { move: boolean }
  }[]
  total: number
  senders: { id: string; name: string }[]
}

async function createFolder(sender: Sender, name: string, parentId?: string) {
  const res = await request(sender, "/api/folders", { method: "POST", json: { name, parentId } })
  expect(res.status).toBe(201)
  return (await json<{ folder: { id: string } }>(res)).folder.id
}

const list = async (sender: Sender, parentId?: string) =>
  json<FolderList>(await request(sender, `/api/folders${parentId ? `?parentId=${parentId}` : ""}`))
const docs = async (sender: Sender, qs = "") =>
  json<DocumentList>(await request(sender, `/api/documents${qs ? `?${qs}` : ""}`))

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
})

describe("folders", () => {
  test("nested folders with counts and breadcrumb path", async () => {
    const contracts = await createFolder(alice, "Contracts")
    const leases = await createFolder(alice, "Leases", contracts)
    await uploadDocument(alice, minimalPdf(), "a.pdf", { folderId: contracts })
    await uploadDocument(alice, minimalPdf(), "b.pdf", { folderId: contracts })
    await uploadDocument(alice, minimalPdf(), "root.pdf")

    const root = await list(alice)
    expect(root.folder).toBeNull()
    expect(root.items).toEqual([
      expect.objectContaining({ name: "Contracts", documentCount: 2, folderCount: 1 }),
    ])

    const inside = await list(alice, leases)
    expect(inside.path.map((p) => p.name)).toEqual(["Contracts", "Leases"])

    expect((await docs(alice)).items.map((d) => d.name)).toEqual(["root.pdf"])
    expect((await docs(alice, `folderId=${contracts}`)).total).toBe(2)
  })

  test("sibling names are unique (case-insensitive) → 409", async () => {
    await createFolder(alice, "HR")
    const res = await request(alice, "/api/folders", { method: "POST", json: { name: "hr" } })
    expect(res.status).toBe(409)
  })

  test("rename and move; a folder can't move into its own subtree", async () => {
    const a = await createFolder(alice, "A")
    const b = await createFolder(alice, "B", a)
    const rename = await request(alice, `/api/folders/${a}`, {
      method: "PATCH",
      json: { name: "Archive" },
    })
    expect(rename.status).toBe(200)
    const cycle = await request(alice, `/api/folders/${a}`, {
      method: "PATCH",
      json: { parentId: b },
    })
    expect(cycle.status).toBe(400)
    const up = await request(alice, `/api/folders/${b}`, {
      method: "PATCH",
      json: { parentId: null },
    })
    expect(up.status).toBe(200)
    expect((await list(alice)).items.map((f) => f.name)).toEqual(["Archive", "B"])
  })

  test(`nesting stops at ${MAX_FOLDER_DEPTH} levels`, async () => {
    let parent: string | undefined
    for (let i = 0; i < MAX_FOLDER_DEPTH; i++) parent = await createFolder(alice, `L${i}`, parent)
    const res = await request(alice, "/api/folders", {
      method: "POST",
      json: { name: "Too deep", parentId: parent },
    })
    expect(res.status).toBe(400)
  })

  test("deleting a folder moves its documents and subfolders to the parent", async () => {
    const outer = await createFolder(alice, "Outer")
    const inner = await createFolder(alice, "Inner", outer)
    const leaf = await createFolder(alice, "Leaf", inner)
    const { document } = await uploadDocument(alice, minimalPdf(), "x.pdf", { folderId: inner })

    const res = await request(alice, `/api/folders/${inner}`, { method: "DELETE" })
    expect(res.status).toBe(204)
    expect(await prisma.folder.findUnique({ where: { id: inner } })).toBeNull()
    expect((await prisma.folder.findUnique({ where: { id: leaf } }))?.parentId).toBe(outer)
    expect((await prisma.document.findUnique({ where: { id: document.id } }))?.folderId).toBe(outer)
  })

  test("members change only their own folders; admins change any", async () => {
    const mine = await createFolder(alice, "Alice's")
    const bob = await joinOrganization(alice, "bob", "member")
    const carol = await joinOrganization(alice, "carol", "admin")
    expect((await list(bob)).items[0]?.permissions.manage).toBe(false)
    const denied = await request(bob, `/api/folders/${mine}`, { method: "DELETE" })
    expect(denied.status).toBe(403)
    await createFolder(bob, "Bob's")
    const allowed = await request(carol, `/api/folders/${mine}`, {
      method: "PATCH",
      json: { name: "Shared" },
    })
    expect(allowed.status).toBe(200)
  })

  test("an org delete cascades through nested folders", async () => {
    const a = await createFolder(alice, "A")
    await createFolder(alice, "B", a)
    await prisma.organization.delete({ where: { id: alice.organizationId } })
    expect(await prisma.folder.count()).toBe(0)
  })
})

describe("documents in folders", () => {
  test("move a document between folders and back to the root", async () => {
    const f = await createFolder(alice, "Signed")
    const { document } = await uploadDocument(alice)
    const moved = await request(alice, `/api/documents/${document.id}`, {
      method: "PATCH",
      json: { folderId: f },
    })
    expect(moved.status).toBe(200)
    expect((await docs(alice, `folderId=${f}`)).items.map((d) => d.id)).toEqual([document.id])
    await request(alice, `/api/documents/${document.id}`, {
      method: "PATCH",
      json: { folderId: null },
    })
    expect((await docs(alice)).total).toBe(1)
  })

  test("members move only documents they uploaded", async () => {
    const { document } = await uploadDocument(alice)
    const bob = await joinOrganization(alice, "bob", "member")
    expect((await docs(bob)).items[0]?.permissions.move).toBe(false)
    const res = await request(bob, `/api/documents/${document.id}`, {
      method: "PATCH",
      json: { folderId: null },
    })
    expect(res.status).toBe(403)
  })

  test("search spans every folder; status, sender and period filter", async () => {
    const f = await createFolder(alice, "Deep")
    await uploadDocument(alice, minimalPdf(), "Lease NDA.pdf", { folderId: f })
    await uploadDocument(alice, minimalPdf(), "invoice.pdf")
    const bob = await joinOrganization(alice, "bob", "member")
    await uploadDocument(bob, minimalPdf(), "bob-nda.pdf")

    const found = await docs(alice, "q=nda")
    expect(found.items.map((d) => d.name).sort()).toEqual(["Lease NDA.pdf", "bob-nda.pdf"])
    expect(found.items.find((d) => d.name === "Lease NDA.pdf")?.folder?.id).toBe(f)
    expect((await docs(alice, `q=nda&senderId=${bob.userId}`)).total).toBe(1)
    expect((await docs(alice, "status=FAILED")).total).toBe(0)
    expect((await docs(alice, "period=7d")).total).toBe(2)
    expect(found.senders.map((s) => s.name).sort()).toEqual(["alice", "bob"])

    await prisma.document.updateMany({ data: { createdAt: new Date("2020-01-01") } })
    expect((await docs(alice, "period=year")).total).toBe(0)
  })

  test("unknown folder → 404 on list, upload and move", async () => {
    expect((await request(alice, "/api/documents?folderId=nope")).status).toBe(404)
    expect((await request(alice, "/api/folders?parentId=nope")).status).toBe(404)
    const { document } = await uploadDocument(alice)
    const res = await request(alice, `/api/documents/${document.id}`, {
      method: "PATCH",
      json: { folderId: "nope" },
    })
    expect(res.status).toBe(404)
  })
})
