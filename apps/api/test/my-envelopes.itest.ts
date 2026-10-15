import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

// ADR 0062, docs/security.md → Signer accounts: envelopes sent to the caller's verified email.
interface Item {
  recipientId: string
  title: string
  workspace: string
  sender: string
  group: string
  canDownload: boolean
  canRequestLink: boolean
}

let alice: Sender
let juma: Sender
let envelopeId: string
let jumaRecipientId: string
let otherRecipientId: string

/** alice sends an envelope to juma (his email typed in capitals) and to someone else. */
beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  juma = await createSender("juma", { withOrganization: false })
  const { document } = await uploadDocument(alice)
  const created = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Offer letter" },
  })
  envelopeId = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const put = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: {
      recipients: [
        { name: "Juma", email: juma.email.toUpperCase() },
        { name: "Other", email: "other@example.test" },
      ],
    },
  })
  const recipients = ((await put.json()) as { recipients: { id: string }[] }).recipients
  jumaRecipientId = recipients[0]?.id ?? ""
  otherRecipientId = recipients[1]?.id ?? ""
  await request(alice, `/api/envelopes/${envelopeId}/fields`, {
    method: "PUT",
    json: {
      fields: recipients.map((r, i) => ({
        recipientId: r.id,
        type: "SIGNATURE",
        page: 1,
        x: 0.1,
        y: 0.1 + i * 0.2,
        width: 0.3,
        height: 0.06,
      })),
    },
  })
  const sent = await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
  expect(sent.status).toBe(200)
})

const list = async (who: Sender = juma) =>
  (await (await request(who, "/api/me/envelopes")).json()) as { verified: boolean; items: Item[] }

describe("GET /api/me/envelopes", () => {
  test("lists the envelope sent to the verified email, whatever its case", async () => {
    const { verified, items } = await list()
    expect(verified).toBe(true)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      recipientId: jumaRecipientId,
      title: "Offer letter",
      workspace: "alice Ltd",
      group: "waiting",
      canDownload: false,
      canRequestLink: true,
    })
  })

  test("never returns tokens or the other recipients", async () => {
    const body = JSON.stringify(await list())
    expect(body).not.toMatch(/token|hash/i)
    expect(body).not.toContain("other@example.test")
    expect(body).not.toContain(otherRecipientId)
  })

  test("an unverified email sees nothing", async () => {
    await prisma.user.update({ where: { id: juma.userId }, data: { emailVerified: false } })
    expect(await list()).toEqual({ verified: false, items: [] })
    const res = await request(juma, `/api/me/envelopes/${jumaRecipientId}/downloads`)
    expect(res.status).toBe(404)
  })

  test("someone else's account doesn't see it", async () => {
    const mallory = await createSender("mallory", { withOrganization: false })
    expect((await list(mallory)).items).toEqual([])
  })

  test("drafts are never listed", async () => {
    await prisma.envelope.update({ where: { id: envelopeId }, data: { status: "DRAFT" } })
    expect((await list()).items).toEqual([])
  })

  test("needs a session", async () => {
    const res = await request({ ...juma, cookie: "" }, "/api/me/envelopes")
    expect(res.status).toBe(401)
  })
})

describe("GET /api/me/envelopes/:recipientId/downloads", () => {
  test("another recipient's id is 404, even with a session", async () => {
    const res = await request(juma, `/api/me/envelopes/${otherRecipientId}/downloads`)
    expect(res.status).toBe(404)
  })

  test("409 until the envelope is completed", async () => {
    const res = await request(juma, `/api/me/envelopes/${jumaRecipientId}/downloads`)
    expect(res.status).toBe(409)
  })

  test("410 once the files are purged", async () => {
    await prisma.envelope.update({
      where: { id: envelopeId },
      data: { status: "COMPLETED", purgedAt: new Date() },
    })
    const res = await request(juma, `/api/me/envelopes/${jumaRecipientId}/downloads`)
    expect(res.status).toBe(410)
  })
})

describe("POST /api/me/envelopes/:recipientId/link", () => {
  test("waits out the cooldown after the invitation", async () => {
    const res = await request(juma, `/api/me/envelopes/${jumaRecipientId}/link`, { method: "POST" })
    expect(res.status).toBe(429)
  })

  test("rotates the link, audits it and returns no token", async () => {
    await prisma.recipient.update({
      where: { id: jumaRecipientId },
      data: { notifiedAt: new Date(Date.now() - 24 * 3600_000) },
    })
    const before = await prisma.recipient.findUniqueOrThrow({ where: { id: jumaRecipientId } })
    const res = await request(juma, `/api/me/envelopes/${jumaRecipientId}/link`, { method: "POST" })
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).not.toMatch(/token/i)
    const after = await prisma.recipient.findUniqueOrThrow({ where: { id: jumaRecipientId } })
    expect(after.tokenHash).not.toBe(before.tokenHash)
    const event = await prisma.auditEvent.findFirst({
      where: { envelopeId, type: "recipient.link_requested" },
    })
    expect(event).toMatchObject({ recipientId: jumaRecipientId, actorUserId: juma.userId })
  })

  test("another recipient's id is 404", async () => {
    const res = await request(juma, `/api/me/envelopes/${otherRecipientId}/link`, {
      method: "POST",
    })
    expect(res.status).toBe(404)
  })
})
