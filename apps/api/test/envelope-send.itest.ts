import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender
let envelopeId: string

type Issue = { code: string; recipientId?: string }

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
  const { document } = await uploadDocument(alice)
  const res = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Lease" },
  })
  envelopeId = ((await res.json()) as { envelope: { id: string } }).envelope.id
})

async function addRecipients(recipients: unknown[]) {
  const res = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: { recipients },
  })
  return ((await res.json()) as { recipients: { id: string; email: string }[] }).recipients
}

const preflight = async (sender: Sender = alice) => {
  const res = await request(sender, `/api/envelopes/${envelopeId}/preflight`)
  return { status: res.status, body: (await res.json()) as { issues: Issue[] } }
}

describe("GET /envelopes/:id/preflight", () => {
  test("lists every issue for a fresh draft", async () => {
    const { status, body } = await preflight()
    expect(status).toBe(200)
    expect(body.issues.map((i) => i.code)).toEqual(["no_signers"])
  })

  test("names each recipient's problem", async () => {
    const [a, b] = await addRecipients([
      { name: "A", email: "a@example.com" },
      { name: "B", email: "b@example.com", verification: "SMS_OTP", phone: "+254712345678" },
    ])
    const { body } = await preflight()
    expect(body.issues).toEqual([
      expect.objectContaining({ code: "missing_signature_field", recipientId: a?.id }),
      expect.objectContaining({ code: "missing_signature_field", recipientId: b?.id }),
    ])
  })

  test("another organization gets 404", async () => {
    expect((await preflight(bob)).status).toBe(404)
  })
})

describe("POST /envelopes/:id/send", () => {
  test("refuses with all issues while preflight fails, and changes nothing", async () => {
    await addRecipients([{ name: "A", email: "a@example.com" }])
    const res = await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; message: string; issues: Issue[] }
    expect(body.error).toBe("preflight_failed")
    expect(body.message).toContain("signature field")
    expect(body.issues).toHaveLength(1)
    const env = await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } })
    expect(env.status).toBe("DRAFT")
  })

  test("sends once preflight passes: SENT, links issued (hashes only), audited", async () => {
    const [a] = await addRecipients([
      { name: "A", email: "a@example.com" },
      { name: "cc", email: "cc@example.com", role: "VIEWER" },
    ])
    await request(alice, `/api/envelopes/${envelopeId}/fields`, {
      method: "PUT",
      json: {
        fields: [
          {
            recipientId: a?.id,
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
    expect((await preflight()).body.issues).toEqual([])

    const res = await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toMatch(/token/i)

    const env = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { recipients: true, auditEvents: { orderBy: { seq: "asc" } } },
    })
    expect(env.status).toBe("SENT")
    const signer = env.recipients.find((r) => r.id === a?.id)
    expect(signer?.status).toBe("SENT")
    expect(signer?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(env.auditEvents.map((e) => e.type)).toContain("envelope.sent")

    // Sending twice is an invalid transition.
    const again = await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    expect(again.status).toBe(409)
  })

  test("another organization can't send it", async () => {
    const res = await request(bob, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    expect(res.status).toBe(404)
  })
})
