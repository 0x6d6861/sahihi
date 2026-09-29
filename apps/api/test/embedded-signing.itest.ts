import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { getQueues } from "@sahihi/infra"
import {
  app,
  createSender,
  joinOrganization,
  minimalPdf,
  request,
  resetDb,
  type Sender,
} from "./helpers"

// docs/embedded-signing.md
let alice: Sender
let key: string

const api = (path: string, init: RequestInit & { json?: unknown } = {}) => {
  const { json, headers, ...rest } = init
  const h = new Headers(headers)
  h.set("authorization", `Bearer ${key}`)
  if (json !== undefined) h.set("content-type", "application/json")
  return app.request(`/api/v1${path}`, {
    ...rest,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
}

async function envelopeWith(recipients: Record<string, unknown>[], signingOrder = "PARALLEL") {
  const up = await api("/documents?name=nda.pdf", {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: minimalPdf(),
  })
  const { document } = (await up.json()) as { document: { id: string } }
  const res = await api("/envelopes", {
    method: "POST",
    json: {
      documentId: document.id,
      title: "NDA",
      signingOrder,
      recipients,
      fields: recipients.map((_, i) => ({
        recipient: i,
        type: "SIGNATURE",
        page: 1,
        x: 0.1,
        y: 0.1 + i * 0.1,
        width: 0.2,
        height: 0.05,
      })),
      send: true,
    },
  })
  return {
    status: res.status,
    body: (await res.json()) as {
      envelope: { id: string; recipients: { id: string; email: string }[] }
    },
  }
}

const signingUrl = (envelopeId: string, recipientId: string) =>
  api(`/envelopes/${envelopeId}/recipients/${recipientId}/signing-url`, { method: "POST" })

const tokenOf = (url: string) => new URL(url).pathname.split("/").at(-1) as string

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  const res = await request(alice, "/api/api-keys", {
    method: "POST",
    json: { name: "Portal", scopes: ["documents:write", "envelopes:write", "envelopes:read"] },
  })
  key = ((await res.json()) as { key: string }).key
  const set = await request(alice, "/api/embedding", {
    method: "PUT",
    json: { origins: ["https://portal.acme.co.ke/", "http://localhost:5173"] },
  })
  expect(set.status).toBe(200)
})

describe("settings", () => {
  test("owners/admins only; origins validated and normalised", async () => {
    expect(await (await request(alice, "/api/embedding")).json()).toEqual({
      origins: ["https://portal.acme.co.ke", "http://localhost:5173"],
    })
    expect(
      (
        await request(alice, "/api/embedding", {
          method: "PUT",
          json: { origins: ["http://portal.acme.co.ke"] },
        })
      ).status,
    ).toBe(400)
    const bob = await joinOrganization(alice, "bob", "member")
    expect((await request(bob, "/api/embedding")).status).toBe(403)
  })
})

describe("embedded recipients", () => {
  test("are not emailed; get a short-lived signing URL; the page may be framed by the allowed origins", async () => {
    const { status, body } = await envelopeWith([
      { name: "Customer", email: "customer@example.test", delivery: "EMBEDDED" },
      { name: "Legal", email: "legal@example.test" },
    ])
    expect(status).toBe(201)
    const [customer, legal] = body.envelope.recipients
    const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
    const ours = new Set([customer?.id, legal?.id])
    // (The test Redis queue also holds other tests' jobs.)
    const invited = jobs
      .filter((j) => j.name === "envelope.invite" && ours.has(j.data.recipientId))
      .map((j) => j.data.recipientId)
    expect(invited).toEqual([legal?.id])
    const row = await prisma.recipient.findUniqueOrThrow({ where: { id: customer?.id } })
    expect(row).toMatchObject({ status: "SENT", tokenHash: null })
    expect(row.notifiedAt).not.toBeNull()

    const res = await signingUrl(body.envelope.id, customer?.id as string)
    expect(res.status).toBe(201)
    const { url, expiresAt } = (await res.json()) as { url: string; expiresAt: string }
    expect(url).toMatch(/\/sign\/[A-Za-z0-9_-]{43}\?embed=1$/)
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000)

    const token = tokenOf(url)
    const policy = await app.request(`/api/sign/${token}/embed`)
    expect(await policy.json()).toEqual({
      origins: ["https://portal.acme.co.ke", "http://localhost:5173"],
    })
    const page = (await (await app.request(`/api/sign/${token}`)).json()) as {
      state: string
      embed: { origins: string[] }
    }
    expect(page).toMatchObject({
      state: "ready",
      embed: { origins: ["https://portal.acme.co.ke", "http://localhost:5173"] },
    })

    // Email recipients are never framable.
    const legalToken = jobs.find(
      (j) => j.name === "envelope.invite" && j.data.recipientId === legal?.id,
    )?.data.token
    expect(await (await app.request(`/api/sign/${legalToken}/embed`)).json()).toEqual({
      origins: [],
    })
    expect(
      ((await (await app.request(`/api/sign/${legalToken}`)).json()) as { embed: unknown }).embed,
    ).toBeNull()

    // Asking again rotates the URL: the old one stops working.
    const again = (await (await signingUrl(body.envelope.id, customer?.id as string)).json()) as {
      url: string
    }
    expect((await app.request(`/api/sign/${token}`)).status).toBe(404)
    expect((await app.request(`/api/sign/${tokenOf(again.url)}`)).status).toBe(200)

    const audit = await prisma.auditEvent.findMany({
      where: { envelopeId: body.envelope.id, type: "recipient.link_issued" },
    })
    expect(audit).toHaveLength(2)
    expect(audit[0]?.data).toMatchObject({ via: "api" })
  })

  test("no URL before their turn, for email recipients, or twice after signing; no reminders", async () => {
    const { body } = await envelopeWith(
      [
        { name: "Manager", email: "manager@example.test", order: 1 },
        { name: "Customer", email: "customer@example.test", delivery: "EMBEDDED", order: 2 },
      ],
      "SEQUENTIAL",
    )
    const [manager, customer] = body.envelope.recipients
    expect((await signingUrl(body.envelope.id, customer?.id as string)).status).toBe(409)
    expect((await signingUrl(body.envelope.id, manager?.id as string)).status).toBe(409)
    await prisma.recipient.update({ where: { id: customer?.id }, data: { status: "SENT" } })
    const remind = await request(
      alice,
      `/api/envelopes/${body.envelope.id}/recipients/${customer?.id}/remind`,
      { method: "POST" },
    )
    expect(remind.status).toBe(409)
  })

  test("embedded recipients must use link verification", async () => {
    const { status } = await envelopeWith([
      { name: "C", email: "c@example.test", delivery: "EMBEDDED", verification: "EMAIL_OTP" },
    ])
    expect(status).toBe(400)
  })
})
