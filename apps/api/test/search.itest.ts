import { beforeEach, describe, expect, test } from "bun:test"
import type { SearchIndex } from "@sahihi/core"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
})

const index = async (s: Sender) => {
  const res = await request(s, "/api/search")
  expect(res.status).toBe(200)
  return (await res.json()) as SearchIndex
}

describe("GET /search", () => {
  test("lists the workspace's folders, documents and envelopes with their recipients", async () => {
    const folder = await request(alice, "/api/folders", {
      method: "POST",
      json: { name: "Clients" },
    })
    expect(folder.status).toBe(201)
    const { document } = await uploadDocument(alice, undefined, "Lease.pdf")
    const created = await request(alice, "/api/envelopes", {
      method: "POST",
      json: { documentId: document.id, title: "Offer letter" },
    })
    expect(created.status).toBe(201)
    const envelopeId = ((await created.json()) as { envelope: { id: string } }).envelope.id
    const put = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
      method: "PUT",
      json: { recipients: [{ name: "Amina Otieno", email: "amina@example.com", order: 1 }] },
    })
    expect(put.status).toBe(200)

    const { items, truncated } = await index(alice)
    expect(truncated).toBe(false)
    expect(items.find((i) => i.kind === "folder")?.title).toBe("Clients")
    expect(items.find((i) => i.kind === "document")?.title).toBe("Lease.pdf")
    const envelope = items.find((i) => i.kind === "envelope")
    expect(envelope).toMatchObject({ id: envelopeId, title: "Offer letter", status: "DRAFT" })
    expect(envelope?.kind === "envelope" && envelope.people).toEqual([
      "Amina Otieno",
      "amina@example.com",
    ])
    // The assistant is off by default, so drafts aren't listed.
    expect(items.some((i) => i.kind === "draft")).toBe(false)
  })

  test("never includes another workspace's items", async () => {
    await uploadDocument(bob, undefined, "Bob secret.pdf")
    const { items } = await index(alice)
    expect(items).toEqual([])
  })
})
