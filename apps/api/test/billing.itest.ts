import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { auth } from "../src/auth"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// docs/billing.md. Free: 5 envelopes a month, 2 seats.
let alice: Sender
let documentId: string

async function draft(sender: Sender = alice) {
  const created = await request(sender, "/api/envelopes", {
    method: "POST",
    json: { documentId, title: "Quota" },
  })
  const { envelope } = (await created.json()) as { envelope: { id: string } }
  const put = await request(sender, `/api/envelopes/${envelope.id}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Signer", email: "signer@example.test" }] },
  })
  const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  await request(sender, `/api/envelopes/${envelope.id}/fields`, {
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
  return envelope.id
}

const send = (id: string, sender: Sender = alice) =>
  request(sender, `/api/envelopes/${id}/send`, { method: "POST" })

type BillingBody = {
  plan: { id: string }
  envelopes: { used: number; limit: number | null; level: string }
  seats: { used: number; limit: number | null }
}
const billing = async (sender: Sender = alice) =>
  (await (await request(sender, "/api/billing")).json()) as BillingBody

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice", { plan: "free" })
  documentId = (await uploadDocument(alice)).document.id
})

describe("envelope quota", () => {
  test("Free sends 5 a month; the 6th is refused with 402 and stays a draft", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => draft()))
    for (const id of ids.slice(0, 5)) expect((await send(id)).status).toBe(200)
    expect(await billing()).toMatchObject({
      plan: { id: "free" },
      envelopes: { used: 5, limit: 5, level: "exceeded" },
    })

    const refused = await send(ids[5] as string)
    expect(refused.status).toBe(402)
    const body = (await refused.json()) as { error: string; resetsAt: string; message: string }
    expect(body.error).toBe("quota_exceeded")
    expect(new Date(body.resetsAt).getTime()).toBeGreaterThan(Date.now())
    const blocked = await prisma.envelope.findUniqueOrThrow({
      where: { id: ids[5] as string },
      include: { auditEvents: true },
    })
    expect(blocked.status).toBe("DRAFT")
    expect(blocked.auditEvents.map((e) => e.type)).toEqual(["envelope.created"])
  })

  test("concurrent sends can't both take the last envelope", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => draft()))
    for (const id of ids.slice(0, 4)) expect((await send(id)).status).toBe(200)
    const [a, b] = await Promise.all([send(ids[4] as string), send(ids[5] as string)])
    expect([a.status, b.status].sort()).toEqual([200, 402])
  })

  test("last month's envelopes don't count; upgrading lifts the limit", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => draft()))
    for (const id of ids.slice(0, 5)) await send(id)
    await prisma.envelope.updateMany({
      where: { id: { in: ids.slice(0, 3) } },
      data: { sentAt: new Date(Date.now() - 45 * 24 * 3600 * 1000) },
    })
    expect((await billing()).envelopes.used).toBe(2)
    expect((await send(ids[5] as string)).status).toBe(200)

    const more = await Promise.all(Array.from({ length: 3 }, () => draft()))
    for (const id of more.slice(0, 2)) await send(id)
    expect((await send(more[2] as string)).status).toBe(402)
    await prisma.subscription.update({
      where: { organizationId: alice.organizationId },
      data: { plan: "starter" },
    })
    expect((await send(more[2] as string)).status).toBe(200)
  })

  test("drafts, templates and other workspaces are unaffected", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => draft()))
    for (const id of ids) await send(id)
    expect(
      (
        await request(alice, "/api/envelopes", {
          method: "POST",
          json: { documentId, title: "Still a draft" },
        })
      ).status,
    ).toBe(201)
    const bob = await createSender("bob", { plan: "free" })
    const bobDoc = (await uploadDocument(bob)).document.id
    documentId = bobDoc
    expect((await send(await draft(bob), bob)).status).toBe(200)
  })
})

describe("seats", () => {
  test("Free has 2 seats; a pending invitation holds one", async () => {
    const invite = (email: string) =>
      auth.api.createInvitation({
        body: { email, role: "member", organizationId: alice.organizationId },
        headers: new Headers({ cookie: alice.cookie }),
      })
    await expect(invite("first@example.test")).resolves.toBeDefined()
    await expect(invite("second@example.test")).rejects.toThrow(/2 seats/)
    expect((await billing()).seats).toMatchObject({ used: 2, limit: 2 })
  })

  test("adding a member beyond the plan is refused by better-auth", async () => {
    await joinOrganization(alice, "bob", "member")
    await expect(joinOrganization(alice, "carol", "member")).rejects.toThrow()
    expect(await prisma.member.count({ where: { organizationId: alice.organizationId } })).toBe(2)
  })

  test("any member can read the workspace's billing", async () => {
    await prisma.subscription.update({
      where: { organizationId: alice.organizationId },
      data: { plan: "starter" },
    })
    const bob = await joinOrganization(alice, "bob", "member")
    expect(await billing(bob)).toMatchObject({
      plan: { id: "starter" },
      seats: { used: 2, limit: 5 },
    })
  })
})
