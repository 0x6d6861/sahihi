import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender
let envelopeId: string
let originalId: string

const putDocument = (sender: Sender, id: string, documentId: string) =>
  request(sender, `/api/envelopes/${id}/document`, { method: "PUT", json: { documentId } })

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
  const { document } = await uploadDocument(alice)
  originalId = document.id
  const res = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Lease" },
  })
  envelopeId = ((await res.json()) as { envelope: { id: string } }).envelope.id
  const saved = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Amina", email: "amina@example.com" }] },
  })
  const [r] = ((await saved.json()) as { recipients: { id: string }[] }).recipients
  await request(alice, `/api/envelopes/${envelopeId}/fields`, {
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
})

describe("PUT /envelopes/:id/document", () => {
  test("switches the draft to the prepared document, removes fields, audits both hashes", async () => {
    const { document: prepared } = await uploadDocument(alice, undefined, "contract (prepared).pdf")
    const res = await putDocument(alice, envelopeId, prepared.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ documentId: prepared.id, fieldsRemoved: 1 })

    const e = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { fields: true },
    })
    expect(e.documentId).toBe(prepared.id)
    expect(e.fields).toHaveLength(0)
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { envelopeId, type: "envelope.document_replaced" },
    })
    expect(event.data).toMatchObject({
      fromDocumentId: originalId,
      documentId: prepared.id,
      fieldsRemoved: 1,
    })
    // The original stays in the library, untouched.
    expect(await prisma.document.findUnique({ where: { id: originalId } })).not.toBeNull()
  })

  test("only drafts, only the workspace's own READY documents", async () => {
    const { document: bobs } = await uploadDocument(bob)
    expect((await putDocument(alice, envelopeId, bobs.id)).status).toBe(404)
    expect((await putDocument(bob, envelopeId, bobs.id)).status).toBe(404)
    const { document: prepared } = await uploadDocument(alice)
    await prisma.envelope.update({ where: { id: envelopeId }, data: { status: "VOIDED" } })
    expect((await putDocument(alice, envelopeId, prepared.id)).status).toBe(409)
  })
})
