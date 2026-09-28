import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender
let envelopeId: string

async function createDraft(sender: Sender, signingOrder: "PARALLEL" | "SEQUENTIAL") {
  const { document } = await uploadDocument(sender)
  const res = await request(sender, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Lease", signingOrder },
  })
  return ((await res.json()) as { envelope: { id: string } }).envelope.id
}

const putRecipients = (sender: Sender, id: string, recipients: unknown[]) =>
  request(sender, `/api/envelopes/${id}/recipients`, { method: "PUT", json: { recipients } })

type Issue = { path: string; message: string }

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
  envelopeId = await createDraft(alice, "SEQUENTIAL")
})

describe("PUT /envelopes/:id/recipients", () => {
  test("saves the list, normalises emails, assigns colours and keeps sequential order", async () => {
    const res = await putRecipients(alice, envelopeId, [
      { name: "Amina", email: " Amina@Example.com ", order: 2 },
      { name: "Kip", email: "kip@example.com", role: "APPROVER", order: 1 },
    ])
    expect(res.status).toBe(200)
    const { recipients } = (await res.json()) as {
      recipients: { id: string; email: string; order: number; colorIndex: number }[]
    }
    const byEmail = Object.fromEntries(recipients.map((r) => [r.email, r]))
    expect(byEmail["amina@example.com"]).toMatchObject({ order: 2, colorIndex: 0 })
    expect(byEmail["kip@example.com"]).toMatchObject({ order: 1, colorIndex: 1 })
    // Never leak token hashes.
    expect(JSON.stringify(recipients)).not.toContain("tokenHash")
  })

  test("parallel envelopes store order 1 for everyone", async () => {
    const parallel = await createDraft(alice, "PARALLEL")
    const res = await putRecipients(alice, parallel, [
      { name: "A", email: "a@example.com", order: 3 },
      { name: "B", email: "b@example.com", order: 7 },
    ])
    const { recipients } = (await res.json()) as { recipients: { order: number }[] }
    expect(recipients.map((r) => r.order)).toEqual([1, 1])
  })

  test("reports field-level issues the form can map (SMS phone, duplicate email)", async () => {
    const res = await putRecipients(alice, envelopeId, [
      { name: "A", email: "a@example.com", verification: "SMS_OTP" },
      { name: "B", email: "A@EXAMPLE.COM" },
    ])
    expect(res.status).toBe(400)
    const { issues } = (await res.json()) as { issues: Issue[] }
    expect(issues.map((i) => i.path).sort()).toEqual(["recipients.0.phone", "recipients.1.email"])
  })

  test("existing ids are updated in place; a recipient turned VIEWER loses their fields", async () => {
    const first = await putRecipients(alice, envelopeId, [{ name: "A", email: "a@example.com" }])
    const [saved] = ((await first.json()) as { recipients: { id: string }[] }).recipients
    if (!saved) throw new Error("no recipient saved")
    const fields = await request(alice, `/api/envelopes/${envelopeId}/fields`, {
      method: "PUT",
      json: {
        fields: [
          {
            recipientId: saved.id,
            type: "SIGNATURE",
            page: 1,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.05,
          },
        ],
      },
    })
    expect(fields.status).toBe(200)

    const again = await putRecipients(alice, envelopeId, [
      { id: saved.id, name: "A (cc)", email: "a@example.com", role: "VIEWER" },
    ])
    const [updated] = ((await again.json()) as { recipients: { id: string; name: string }[] })
      .recipients
    expect(updated).toMatchObject({ id: saved.id, name: "A (cc)" })
    expect(await prisma.field.count({ where: { envelopeId } })).toBe(0)
  })

  test("another organization gets 404 and the list is untouched", async () => {
    await putRecipients(alice, envelopeId, [{ name: "A", email: "a@example.com" }])
    const res = await putRecipients(bob, envelopeId, [{ name: "Mallory", email: "m@example.com" }])
    expect(res.status).toBe(404)
    const names = (await prisma.recipient.findMany({ where: { envelopeId } })).map((r) => r.name)
    expect(names).toEqual(["A"])
  })
})
