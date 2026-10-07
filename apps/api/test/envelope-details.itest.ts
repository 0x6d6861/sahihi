import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender
let envelopeId: string

const putDetails = (sender: Sender, id: string, json: unknown) =>
  request(sender, `/api/envelopes/${id}/details`, { method: "PUT", json })

const details = {
  title: "Lease 2026",
  message: "Please sign by Friday.",
  signingOrder: "PARALLEL",
  expiresAt: null,
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
  const { document } = await uploadDocument(alice)
  const res = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Lease", signingOrder: "PARALLEL" },
  })
  envelopeId = ((await res.json()) as { envelope: { id: string } }).envelope.id
  await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: {
      recipients: [
        { name: "Amina", email: "amina@example.com" },
        { name: "Kip", email: "kip@example.com" },
      ],
    },
  })
})

describe("PUT /envelopes/:id/details", () => {
  test("saves title, message, order and expiry of a draft", async () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const res = await putDetails(alice, envelopeId, { ...details, expiresAt })
    expect(res.status).toBe(200)
    const saved = await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } })
    expect(saved).toMatchObject({
      title: "Lease 2026",
      message: "Please sign by Friday.",
      signingOrder: "PARALLEL",
    })
    expect(saved.expiresAt?.toISOString()).toBe(expiresAt)
  })

  test("a blank message and a null expiry clear them", async () => {
    await putDetails(alice, envelopeId, {
      ...details,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    })
    await putDetails(alice, envelopeId, { ...details, message: "  ", expiresAt: null })
    const saved = await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } })
    expect(saved.message).toBeNull()
    expect(saved.expiresAt).toBeNull()
  })

  test("sign in order numbers recipients by list position; parallel puts them back on step 1", async () => {
    const orders = async () =>
      (
        await prisma.recipient.findMany({
          where: { envelopeId },
          orderBy: { colorIndex: "asc" },
        })
      ).map((r) => r.order)
    await putDetails(alice, envelopeId, { ...details, signingOrder: "SEQUENTIAL" })
    expect(await orders()).toEqual([1, 2])
    await putDetails(alice, envelopeId, details)
    expect(await orders()).toEqual([1, 1])
  })

  test("rejects an expiry in the past with an issue on expiresAt", async () => {
    const res = await putDetails(alice, envelopeId, {
      ...details,
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    })
    expect(res.status).toBe(400)
    const { issues } = (await res.json()) as { issues: { path: string }[] }
    expect(issues.map((i) => i.path)).toEqual(["expiresAt"])
  })

  test("only drafts, and only in the sender's workspace", async () => {
    expect((await putDetails(bob, envelopeId, details)).status).toBe(404)
    await prisma.envelope.update({ where: { id: envelopeId }, data: { status: "VOIDED" } })
    expect((await putDetails(alice, envelopeId, details)).status).toBe(409)
  })
})
