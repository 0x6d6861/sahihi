import { beforeEach, describe, expect, test } from "bun:test"
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

// ADR 0025: label colours and tags on folders and documents, and searching by them
let alice: Sender

const json = async <T>(res: Response) => (await res.json()) as T

type Tag = { id: string; name: string }
type FolderItem = {
  id: string
  name: string
  color: string | null
  tags: Tag[]
  path?: { id: string; name: string }[]
}
type FolderList = { folder: FolderItem | null; items: FolderItem[] }
type DocumentList = {
  items: { id: string; name: string; color: string | null; tags: Tag[] }[]
  total: number
  tags: Tag[]
  colors: string[]
}

async function createFolder(sender: Sender, body: Record<string, unknown>) {
  const res = await request(sender, "/api/folders", { method: "POST", json: body })
  expect(res.status).toBe(201)
  return (await json<{ folder: { id: string } }>(res)).folder.id
}
const label = (sender: Sender, path: string, body: Record<string, unknown>) =>
  request(sender, path, { method: "PATCH", json: body })
const folders = async (sender: Sender, qs = "") =>
  json<FolderList>(await request(sender, `/api/folders${qs ? `?${qs}` : ""}`))
const docs = async (sender: Sender, qs = "") =>
  json<DocumentList>(await request(sender, `/api/documents${qs ? `?${qs}` : ""}`))
const names = (items: { name: string }[]) => items.map((i) => i.name).sort()

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
})

describe("labels", () => {
  test("a folder gets a colour and tags on create and update", async () => {
    const id = await createFolder(alice, { name: "Clients", color: "1570d1", tags: ["Acme"] })
    let [folder] = (await folders(alice)).items
    // Stored normalized: uppercase with "#".
    expect(folder).toMatchObject({ color: "#1570D1", tags: [{ name: "Acme" }] })

    const res = await label(alice, `/api/folders/${id}`, { color: null, tags: ["Beta", "acme"] })
    expect(res.status).toBe(200)
    ;[folder] = (await folders(alice)).items
    // "acme" is the existing tag: its first spelling stays.
    expect(folder).toMatchObject({ color: null })
    expect(names(folder?.tags ?? [])).toEqual(["Acme", "Beta"])
  })

  test("a document's tags are replaced as a whole and shared case-insensitively", async () => {
    const { document: a } = await uploadDocument(alice, minimalPdf(), "a.pdf")
    const { document: b } = await uploadDocument(alice, minimalPdf(), "b.pdf")
    expect((await label(alice, `/api/documents/${a.id}`, { tags: ["NDA", "Q3"] })).status).toBe(200)
    expect(
      (await label(alice, `/api/documents/${b.id}`, { tags: ["nda"], color: "#D73337" })).status,
    ).toBe(200)
    expect(await prisma.tag.count()).toBe(2)

    const list = await docs(alice)
    expect(list.items.find((d) => d.id === b.id)).toMatchObject({
      color: "#D73337",
      tags: [{ name: "NDA" }],
    })
    expect(names(list.tags)).toEqual(["NDA", "Q3"])

    await label(alice, `/api/documents/${a.id}`, { tags: [] })
    // Q3 is no longer on anything: still stored, no longer offered.
    expect(names((await docs(alice)).tags)).toEqual(["NDA"])
  })

  test("invalid colours and tags → 400", async () => {
    const { document } = await uploadDocument(alice)
    for (const body of [
      { color: "red" },
      { color: "#f00" },
      { tags: ["a,b"] },
      { tags: [""] },
      {},
    ]) {
      expect((await label(alice, `/api/documents/${document.id}`, body)).status).toBe(400)
    }
  })

  test("search finds documents and folders by name or tag, in every folder", async () => {
    const deep = await createFolder(alice, { name: "Deep" })
    await createFolder(alice, { name: "Vendors", parentId: deep, tags: ["Supplier"] })
    await createFolder(alice, { name: "Supplier contracts" })
    const { document } = await uploadDocument(alice, minimalPdf(), "x.pdf", { folderId: deep })
    await label(alice, `/api/documents/${document.id}`, { tags: ["Supplier"] })
    await uploadDocument(alice, minimalPdf(), "other.pdf")

    expect(names((await docs(alice, "q=suppl")).items)).toEqual(["x.pdf"])
    const found = await folders(alice, "q=suppl")
    expect(names(found.items)).toEqual(["Supplier contracts", "Vendors"])
    expect(found.items.find((f) => f.name === "Vendors")?.path?.map((p) => p.name)).toEqual([
      "Deep",
    ])
  })

  test("tag and colour filters span every folder", async () => {
    const deep = await createFolder(alice, { name: "Deep" })
    await createFolder(alice, {
      name: "Red one",
      parentId: deep,
      color: "#D73337",
      tags: ["Urgent"],
    })
    const { document: a } = await uploadDocument(alice, minimalPdf(), "a.pdf", { folderId: deep })
    const { document: b } = await uploadDocument(alice, minimalPdf(), "b.pdf")
    await label(alice, `/api/documents/${a.id}`, { color: "#D73337", tags: ["Urgent"] })
    await label(alice, `/api/documents/${b.id}`, { color: "#1570D1", tags: ["urgent-ish"] })

    expect(names((await docs(alice, "tag=urgent")).items)).toEqual(["a.pdf"])
    expect(names((await docs(alice, "color=D73337")).items)).toEqual(["a.pdf"])
    expect(names((await docs(alice, "color=%231570D1&tag=Urgent")).items)).toEqual([])
    expect(names((await folders(alice, "tag=URGENT")).items)).toEqual(["Red one"])
    expect(names((await folders(alice, "color=1570D1")).items)).toEqual([])
    // Color filter options: colours in use, presets first.
    await createFolder(alice, { name: "Custom", color: "#123456" })
    expect((await docs(alice)).colors).toEqual(["#D73337", "#1570D1", "#123456"])
  })

  test("a document renames until a sent envelope uses it", async () => {
    const { document } = await uploadDocument(alice, minimalPdf(), "draft.pdf")
    expect(
      (await label(alice, `/api/documents/${document.id}`, { name: "Lease.pdf" })).status,
    ).toBe(200)
    const created = await request(alice, "/api/envelopes", {
      method: "POST",
      json: { documentId: document.id, title: "Lease" },
    })
    const { envelope } = (await created.json()) as { envelope: { id: string } }
    // A draft doesn't freeze the name.
    type Row = { id: string; permissions: { rename: boolean } }
    const row = async () =>
      (await json<{ items: Row[] }>(await request(alice, "/api/documents"))).items[0]
    expect((await row())?.permissions.rename).toBe(true)

    await prisma.envelope.update({ where: { id: envelope.id }, data: { status: "SENT" } })
    expect((await row())?.permissions.rename).toBe(false)
    const res = await label(alice, `/api/documents/${document.id}`, { name: "Other.pdf" })
    expect(res.status).toBe(409)
    // Same name, colour or tags still save.
    expect(
      (await label(alice, `/api/documents/${document.id}`, { name: "Lease.pdf", color: "#D73337" }))
        .status,
    ).toBe(200)
    expect((await prisma.document.findUnique({ where: { id: document.id } }))?.name).toBe(
      "Lease.pdf",
    )
  })

  test("members label only their own documents and folders", async () => {
    const { document } = await uploadDocument(alice)
    const folder = await createFolder(alice, { name: "Alice's" })
    const bob = await joinOrganization(alice, "bob", "member")
    expect((await label(bob, `/api/documents/${document.id}`, { color: "#D73337" })).status).toBe(
      403,
    )
    expect((await label(bob, `/api/folders/${folder}`, { tags: ["x"] })).status).toBe(403)
  })

  test("tags never cross workspaces", async () => {
    const other = await createSender("mallory")
    const { document } = await uploadDocument(other)
    await label(other, `/api/documents/${document.id}`, { tags: ["Secret"] })
    const { document: mine } = await uploadDocument(alice)
    await label(alice, `/api/documents/${mine.id}`, { tags: ["secret"] })

    expect(await prisma.tag.count()).toBe(2)
    expect((await docs(alice)).tags.map((t) => t.name)).toEqual(["secret"])
    expect((await docs(alice, "tag=secret")).items.map((d) => d.id)).toEqual([mine.id])
    expect((await label(alice, `/api/documents/${document.id}`, { color: "#D73337" })).status).toBe(
      404,
    )
  })
})
