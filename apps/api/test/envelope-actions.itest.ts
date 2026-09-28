import { beforeEach, describe, expect, test } from "bun:test"
import { MANUAL_REMINDER_COOLDOWN_MS } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { getQueues } from "@sahihi/infra"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender
let envelopeId: string
let first: { id: string } // step 1, invited on send
let second: { id: string } // step 2, not invited yet

/** Newest raw token issued for a recipient (only job payloads carry raw tokens). */
async function latestToken(recipientId: string, name: "envelope.invite" | "envelope.reminder") {
  const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
  return jobs
    .filter((j) => j.name === name && j.data.recipientId === recipientId)
    .sort((a, b) => b.timestamp - a.timestamp)[0]?.data.token as string | undefined
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
  const { document } = await uploadDocument(alice)
  const created = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Actions", signingOrder: "SEQUENTIAL" },
  })
  envelopeId = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const put = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: {
      recipients: [
        { name: "First", email: "first@example.test", order: 1 },
        { name: "Second", email: "second@example.test", order: 2 },
      ],
    },
  })
  const saved = ((await put.json()) as { recipients: { id: string; email: string }[] }).recipients
  const byEmail = (e: string) => {
    const r = saved.find((x) => x.email === e)
    if (!r) throw new Error(`no ${e}`)
    return r
  }
  first = byEmail("first@example.test")
  second = byEmail("second@example.test")
  await request(alice, `/api/envelopes/${envelopeId}/fields`, {
    method: "PUT",
    json: {
      fields: [first, second].map((r, i) => ({
        recipientId: r.id,
        type: "SIGNATURE",
        page: 1,
        x: 0.1,
        y: 0.1 + i * 0.1,
        width: 0.3,
        height: 0.06,
      })),
    },
  })
  expect(
    (await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })).status,
  ).toBe(200)
})

const remind = (sender: Sender, recipientId: string) =>
  request(sender, `/api/envelopes/${envelopeId}/recipients/${recipientId}/remind`, {
    method: "POST",
  })

/** Move the recipient's last notification back past the cooldown. */
const ageNotification = (recipientId: string) =>
  prisma.recipient.update({
    where: { id: recipientId },
    data: { notifiedAt: new Date(Date.now() - MANUAL_REMINDER_COOLDOWN_MS - 1000) },
  })

describe("POST /envelopes/:id/recipients/:rid/remind", () => {
  test("is throttled right after the invite (429 + Retry-After)", async () => {
    const res = await remind(alice, first.id)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(3000)
    expect(((await res.json()) as { error: string }).error).toBe("reminder_cooldown")
  })

  test("rotates the link: the old one stops working, the reminder's one works", async () => {
    const oldToken = await latestToken(first.id, "envelope.invite")
    await ageNotification(first.id)
    const res = await remind(alice, first.id)
    expect(res.status).toBe(200)

    const newToken = await latestToken(first.id, "envelope.reminder")
    expect(newToken).toBeTruthy()
    expect(newToken).not.toBe(oldToken)
    expect((await request(null, `/api/sign/${oldToken}`)).status).toBe(404)
    expect((await request(null, `/api/sign/${newToken}`)).status).toBe(200)

    const r = await prisma.recipient.findUniqueOrThrow({ where: { id: first.id } })
    expect(r.reminderCount).toBe(1)
    expect(r.lastRemindedAt).not.toBeNull()
    const audit = await prisma.auditEvent.findFirst({
      where: { envelopeId, type: "recipient.reminded", recipientId: first.id },
    })
    expect(audit?.actorUserId).toBe(alice.userId)

    // And the cooldown now counts from this reminder.
    expect((await remind(alice, first.id)).status).toBe(429)
  })

  test("a later sequential step can't be reminded yet (409 not_their_turn)", async () => {
    const res = await remind(alice, second.id)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe("not_their_turn")
  })

  test("another organization gets 404 and no reminder is sent", async () => {
    await ageNotification(first.id)
    expect((await remind(bob, first.id)).status).toBe(404)
    const r = await prisma.recipient.findUniqueOrThrow({ where: { id: first.id } })
    expect(r.reminderCount).toBe(0)
  })
})

describe("POST /envelopes/:id/void", () => {
  const voidIt = (sender: Sender, reason: unknown = "Sent the wrong version") =>
    request(sender, `/api/envelopes/${envelopeId}/void`, { method: "POST", json: { reason } })

  test("voids, kills every outstanding link, audits the reason and notifies", async () => {
    const token = await latestToken(first.id, "envelope.invite")
    expect((await voidIt(alice)).status).toBe(200)

    const env = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { recipients: true },
    })
    expect(env.status).toBe("VOIDED")
    expect(env.voidReason).toBe("Sent the wrong version")
    expect(env.recipients.every((r) => r.tokenHash === null)).toBe(true)
    expect((await request(null, `/api/sign/${token}`)).status).toBe(404)

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { envelopeId, type: "envelope.voided" },
    })
    expect(audit.data).toEqual({ reason: "Sent the wrong version" })
    const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
    expect(jobs.some((j) => j.name === "envelope.voided" && j.data.envelopeId === envelopeId)).toBe(
      true,
    )
  })

  test("needs a reason, can't void twice, and reminders stop afterwards", async () => {
    expect((await voidIt(alice, "   ")).status).toBe(400)
    expect((await voidIt(alice)).status).toBe(200)
    expect((await voidIt(alice)).status).toBe(409)
    await ageNotification(first.id)
    const res = await remind(alice, first.id)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe("envelope_closed")
  })

  test("another organization gets 404 and the envelope is untouched", async () => {
    expect((await voidIt(bob)).status).toBe(404)
    const env = await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } })
    expect(env.status).toBe("SENT")
  })
})
