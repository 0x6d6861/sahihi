import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { verifyWebhookSignature } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { getQueues } from "@sahihi/infra"
import { deliverWebhook, sweepWebhookOutbox } from "../../worker/src/jobs/webhooks"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// docs/webhooks.md. The worker's delivery function is called directly (no worker process).

type Received = { headers: Headers; body: string }
const received: Received[] = []
let respondWith = 200
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    received.push({ headers: req.headers, body: await req.text() })
    return new Response(respondWith === 200 ? "ok" : "boom", { status: respondWith })
  },
})
const hookUrl = `http://127.0.0.1:${server.port}/hooks/sahihi`

let alice: Sender
let envelopeId: string

async function createEndpoint(events: string[], sender: Sender = alice) {
  const res = await request(sender, "/api/webhooks", {
    method: "POST",
    json: { url: hookUrl, description: "ERP", events },
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { endpoint: { id: string; secretHint: string }; secret: string }
}

const deliveries = () => prisma.webhookDelivery.findMany({ orderBy: { createdAt: "asc" } })

async function draftWithSigner() {
  const { document } = await uploadDocument(alice)
  const created = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Supply agreement" },
  })
  envelopeId = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const put = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Otieno", email: "otieno@example.test" }] },
  })
  const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
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
}

beforeAll(() => {
  received.length = 0
})
afterAll(() => server.stop(true))

beforeEach(async () => {
  await resetDb()
  received.length = 0
  respondWith = 200
  alice = await createSender("alice")
  await draftWithSigner()
})

describe("endpoints", () => {
  test("owners/admins only; the secret is returned once and never stored in clear", async () => {
    const bob = await joinOrganization(alice, "bob", "member")
    expect((await request(bob, "/api/webhooks")).status).toBe(403)
    expect(
      (
        await request(bob, "/api/webhooks", {
          method: "POST",
          json: { url: hookUrl, events: ["envelope.sent"] },
        })
      ).status,
    ).toBe(403)

    const { endpoint, secret } = await createEndpoint(["envelope.sent"])
    expect(secret).toMatch(/^whsec_/)
    expect(endpoint.secretHint).toBe(secret.slice(-4))
    const row = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } })
    expect(row.secretEncrypted).not.toContain(secret)
    const list = await (await request(alice, "/api/webhooks")).text()
    expect(list).not.toContain(secret)
    expect(list).not.toContain("secretEncrypted")
  })

  test("bad URLs are rejected on the url field", async () => {
    const res = await request(alice, "/api/webhooks", {
      method: "POST",
      json: { url: "ftp://example.com/x", events: ["envelope.sent"] },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ issues: [{ path: "url" }] })
  })
})

describe("delivery", () => {
  test("send → one signed POST with the envelope snapshot; delivery SUCCEEDED", async () => {
    const { secret } = await createEndpoint(["envelope.sent", "envelope.voided"])
    expect(
      (await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })).status,
    ).toBe(200)

    const [d] = await deliveries()
    expect(d).toMatchObject({ type: "envelope.sent", status: "PENDING", attempts: 0 })
    // Enqueued after commit, with the delivery id as job id.
    expect(await getQueues().webhooks.raw.getJob(`whd-${d?.id}`)).toBeTruthy()

    await deliverWebhook(d?.id as string, { isFinal: false })
    expect(received).toHaveLength(1)
    const [hit] = received
    const body = JSON.parse(hit?.body ?? "{}")
    expect(body).toMatchObject({
      id: d?.eventId,
      type: "envelope.sent",
      organizationId: alice.organizationId,
      data: { envelope: { id: envelopeId, status: "SENT", title: "Supply agreement" } },
    })
    expect(hit?.headers.get("sahihi-event-id")).toBe(d?.eventId)
    expect(
      await verifyWebhookSignature(hit?.headers.get("sahihi-signature"), hit?.body ?? "", secret),
    ).toBe(true)
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d?.id } })).toMatchObject({
      status: "SUCCEEDED",
      attempts: 1,
      lastStatusCode: 200,
    })
    // Delivering again is a no-op (idempotent worker).
    await deliverWebhook(d?.id as string, { isFinal: false })
    expect(received).toHaveLength(1)
  })

  test("only subscribed events, only enabled endpoints", async () => {
    const { endpoint } = await createEndpoint(["envelope.voided"])
    await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    expect(await deliveries()).toHaveLength(0)
    await request(alice, `/api/webhooks/${endpoint.id}`, {
      method: "PATCH",
      json: { enabled: false },
    })
    await request(alice, `/api/envelopes/${envelopeId}/void`, {
      method: "POST",
      json: { reason: "x" },
    })
    expect(await deliveries()).toHaveLength(0)
  })

  test("failures are recorded and retried; the last attempt marks FAILED; manual retry re-queues", async () => {
    await createEndpoint(["envelope.sent"])
    await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    const [d] = await deliveries()
    respondWith = 500
    await expect(deliverWebhook(d?.id as string, { isFinal: false })).rejects.toThrow("HTTP 500")
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d?.id } })).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastStatusCode: 500,
      lastResponse: "boom",
    })
    await expect(deliverWebhook(d?.id as string, { isFinal: true })).rejects.toThrow()
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d?.id } })).status).toBe(
      "FAILED",
    )

    const retry = await request(
      alice,
      `/api/webhooks/${(await prisma.webhookEndpoint.findFirstOrThrow()).id}/deliveries/${d?.id}/retry`,
      { method: "POST" },
    )
    expect(retry.status).toBe(202)
    respondWith = 200
    await deliverWebhook(d?.id as string, { isFinal: false })
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d?.id } })).status).toBe(
      "SUCCEEDED",
    )
  })

  test("test event, and a rotated secret replaces the old one", async () => {
    const { endpoint, secret: oldSecret } = await createEndpoint(["envelope.completed"])
    const rotated = await request(alice, `/api/webhooks/${endpoint.id}/rotate-secret`, {
      method: "POST",
    })
    const { secret } = (await rotated.json()) as { secret: string }
    const test = await request(alice, `/api/webhooks/${endpoint.id}/test`, { method: "POST" })
    expect(test.status).toBe(202)
    const { delivery } = (await test.json()) as { delivery: { id: string } }
    await deliverWebhook(delivery.id, { isFinal: false })
    const hit = received.at(-1)
    expect(JSON.parse(hit?.body ?? "{}").type).toBe("webhook.test")
    const header = hit?.headers.get("sahihi-signature")
    expect(await verifyWebhookSignature(header, hit?.body ?? "", secret)).toBe(true)
    expect(await verifyWebhookSignature(header, hit?.body ?? "", oldSecret)).toBe(false)
  })

  test("the outbox sweep enqueues deliveries that were committed but never queued", async () => {
    await createEndpoint(["envelope.sent"])
    await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    const [d] = await deliveries()
    await getQueues().webhooks.raw.remove(`whd-${d?.id}`) // simulate a crash before enqueue
    await prisma.$executeRaw`UPDATE "WebhookDelivery" SET "createdAt" = now() - interval '10 minutes'`
    expect(await sweepWebhookOutbox()).toEqual({ enqueued: 1 })
    expect(await getQueues().webhooks.raw.getJob(`whd-${d?.id}`)).toBeTruthy()
  })
})

describe("other emit points", () => {
  async function inviteToken() {
    const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
    const job = jobs
      .filter((j) => j.name === "envelope.invite")
      .sort((a, b) => b.timestamp - a.timestamp)[0]
    return job?.data.token as string
  }

  test("a decline emits envelope.declined with the recipient", async () => {
    await createEndpoint(["envelope.declined"])
    await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    const token = await inviteToken()
    await request(null, `/api/sign/${token}/file`)
    const res = await request(null, `/api/sign/${token}/decline`, {
      method: "POST",
      json: { reason: "Wrong price" },
    })
    expect(res.status).toBe(200)
    const [d] = await deliveries()
    expect(d?.type).toBe("envelope.declined")
    expect(d?.payload).toMatchObject({
      envelope: {
        status: "DECLINED",
        recipients: [{ status: "DECLINED", declineReason: "Wrong price" }],
      },
    })
    expect((d?.payload as { recipientId?: string } | undefined)?.recipientId).toBeString()
  })

  test("the expiry job emits envelope.expired", async () => {
    const { expireEnvelopes } = await import("../../worker/src/jobs/maintenance")
    await createEndpoint(["envelope.expired"])
    await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
    await prisma.envelope.update({
      where: { id: envelopeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    await expireEnvelopes()
    const [d] = await deliveries()
    expect(d).toMatchObject({
      type: "envelope.expired",
      payload: { envelope: { status: "EXPIRED" } },
    })
  })
})
