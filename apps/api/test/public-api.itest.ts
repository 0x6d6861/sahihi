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
  uploadDocument,
} from "./helpers"

// docs/public-api.md
let alice: Sender

const ALL = [
  "documents:read",
  "documents:write",
  "templates:read",
  "envelopes:read",
  "envelopes:write",
]

async function createKey(sender: Sender, scopes = ALL, extra: Record<string, unknown> = {}) {
  const res = await request(sender, "/api/api-keys", {
    method: "POST",
    json: { name: "ERP", scopes, ...extra },
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { key: string; apiKey: { id: string; hint: string } }
}

const api = (key: string | null, path: string, init: RequestInit & { json?: unknown } = {}) => {
  const { json, headers, ...rest } = init
  const h = new Headers(headers)
  if (key) h.set("authorization", `Bearer ${key}`)
  if (json !== undefined) h.set("content-type", "application/json")
  return app.request(`/api/v1${path}`, {
    ...rest,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
}

const uploadViaApi = (key: string, bytes = minimalPdf(2), name = "nda.pdf") =>
  api(key, `/documents?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: bytes,
  })

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
})

describe("keys", () => {
  test("owners/admins create keys, shown once and stored hashed; members can't", async () => {
    const { key, apiKey } = await createKey(alice)
    expect(key).toMatch(/^sahihi_sk_[A-Za-z0-9_-]{43}$/)
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: apiKey.id } })
    expect(row.secretHash).not.toContain(key.slice(10))
    const list = await (await request(alice, "/api/api-keys")).text()
    expect(list).not.toContain(key)
    expect(list).toContain(apiKey.hint)

    const bob = await joinOrganization(alice, "bob", "member")
    expect((await request(bob, "/api/api-keys")).status).toBe(403)
  })

  test("missing, malformed, unknown, revoked and expired keys get 401", async () => {
    const { key, apiKey } = await createKey(alice)
    expect((await api(null, "")).status).toBe(401)
    expect((await api("not-a-key", "")).status).toBe(401)
    expect((await api(`sahihi_sk_${"A".repeat(43)}`, "")).status).toBe(401)
    expect((await api(key, "")).status).toBe(200)

    expect((await request(alice, `/api/api-keys/${apiKey.id}`, { method: "DELETE" })).status).toBe(
      204,
    )
    expect((await api(key, "")).status).toBe(401)

    const { key: expiring, apiKey: e } = await createKey(alice, ALL, { expiresInDays: 30 })
    await prisma.apiKey.update({
      where: { id: e.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect((await api(expiring, "")).status).toBe(401)
  })

  test("scopes are enforced per route", async () => {
    const { key } = await createKey(alice, ["envelopes:read"])
    expect((await api(key, "/envelopes")).status).toBe(200)
    expect((await uploadViaApi(key)).status).toBe(403)
    const denied = await api(key, "/templates")
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({
      error: "insufficient_scope",
      required: "templates:read",
    })
    const whoami = (await (await api(key, "")).json()) as { key: { scopes: string[] } }
    expect(whoami.key.scopes).toEqual(["envelopes:read"])
  })
})

describe("documents and envelopes", () => {
  test("upload a PDF, create + send an envelope in one call, read it back, void it", async () => {
    const { key, apiKey } = await createKey(alice)
    const up = await uploadViaApi(key)
    expect(up.status).toBe(201)
    const { document } = (await up.json()) as {
      document: { id: string; status: string; pageCount: number }
    }
    expect(document).toMatchObject({ status: "READY", pageCount: 2 })
    expect((await uploadViaApi(key, new TextEncoder().encode("not a pdf"))).status).toBe(422)

    const created = await api(key, "/envelopes", {
      method: "POST",
      json: {
        documentId: document.id,
        title: "NDA – Acme",
        recipients: [
          { name: "Otieno", email: "otieno@example.test" },
          { name: "Legal", email: "legal@example.test", role: "VIEWER" },
        ],
        fields: [
          { recipient: 0, type: "SIGNATURE", page: 2, x: 0.1, y: 0.8, width: 0.3, height: 0.05 },
          { recipient: 0, type: "DATE_SIGNED", page: 2, x: 0.5, y: 0.8, width: 0.2, height: 0.04 },
        ],
        send: true,
      },
    })
    expect(created.status).toBe(201)
    const { envelope } = (await created.json()) as {
      envelope: { id: string; status: string; recipients: { email: string; status: string }[] }
    }
    expect(envelope.status).toBe("SENT")
    expect(envelope.recipients.map((r) => r.email)).toEqual([
      "otieno@example.test",
      "legal@example.test",
    ])

    // The admin who created the key is the actor; the audit says it came through the API.
    const events = await prisma.auditEvent.findMany({
      where: { envelopeId: envelope.id },
      orderBy: { seq: "asc" },
    })
    expect(events.find((e) => e.type === "envelope.sent")).toMatchObject({
      actorUserId: alice.userId,
      data: { via: "api", apiKeyId: apiKey.id },
    })
    const invites = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
    expect(invites.some((j) => j.name === "envelope.invite")).toBe(true)

    const read = (await (await api(key, `/envelopes/${envelope.id}`)).json()) as {
      envelope: { status: string }
    }
    expect(read.envelope.status).toBe("SENT")
    expect((await api(key, `/envelopes/${envelope.id}/downloads`)).status).toBe(409)
    const voided = await api(key, `/envelopes/${envelope.id}/void`, {
      method: "POST",
      json: { reason: "Wrong party" },
    })
    expect(voided.status).toBe(200)
    expect(((await voided.json()) as { envelope: { status: string } }).envelope.status).toBe(
      "VOIDED",
    )
  })

  test("validation: fields must point at a signer on an existing page", async () => {
    const { key } = await createKey(alice)
    const { document } = (await (await uploadViaApi(key)).json()) as { document: { id: string } }
    const base = {
      documentId: document.id,
      title: "x",
      recipients: [{ name: "V", email: "v@example.test", role: "VIEWER" }],
    }
    const viewerField = await api(key, "/envelopes", {
      method: "POST",
      json: {
        ...base,
        fields: [
          { recipient: 0, type: "SIGNATURE", page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
        ],
      },
    })
    expect(viewerField.status).toBe(400)
    const badPage = await api(key, "/envelopes", {
      method: "POST",
      json: {
        ...base,
        recipients: [{ name: "S", email: "s@example.test" }],
        fields: [
          { recipient: 0, type: "SIGNATURE", page: 9, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
        ],
      },
    })
    expect(badPage.status).toBe(400)
  })

  test("from a template, then listed", async () => {
    const { key } = await createKey(alice)
    const { document } = await uploadDocument(alice)
    const draft = await request(alice, "/api/envelopes", {
      method: "POST",
      json: { documentId: document.id, title: "Lease" },
    })
    const { envelope: src } = (await draft.json()) as { envelope: { id: string } }
    const put = await request(alice, `/api/envelopes/${src.id}/recipients`, {
      method: "PUT",
      json: { recipients: [{ name: "T", email: "t@example.test" }] },
    })
    const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
    await request(alice, `/api/envelopes/${src.id}/fields`, {
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
    const saved = await request(alice, "/api/templates", {
      method: "POST",
      json: { envelopeId: src.id, name: "Lease", roles: [{ recipientId: r?.id, label: "Tenant" }] },
    })
    const { template } = (await saved.json()) as { template: { id: string } }

    const templates = (await (await api(key, "/templates")).json()) as {
      items: { id: string; roles: { id: string }[] }[]
    }
    const roleId = templates.items[0]?.roles[0]?.id
    const res = await api(key, "/envelopes", {
      method: "POST",
      json: {
        templateId: template.id,
        title: "Lease – Unit 9",
        recipients: [{ roleId, name: "Amina", email: "amina@example.test" }],
        send: true,
      },
    })
    expect(res.status).toBe(201)
    const list = (await (await api(key, "/envelopes?status=SENT")).json()) as {
      items: { title: string }[]
      total: number
    }
    expect(list.items.map((e) => e.title)).toContain("Lease – Unit 9")
  })

  test("other workspaces' ids are 404; the plan quota applies", async () => {
    const { key } = await createKey(alice)
    const mallory = await createSender("mallory", { plan: "free" })
    const { document: theirs } = await uploadDocument(mallory)
    const theirEnvelope = await request(mallory, "/api/envelopes", {
      method: "POST",
      json: { documentId: theirs.id, title: "Mallory's" },
    })
    const { envelope } = (await theirEnvelope.json()) as { envelope: { id: string } }
    expect((await api(key, `/envelopes/${envelope.id}`)).status).toBe(404)
    expect((await api(key, `/envelopes/${envelope.id}/send`, { method: "POST" })).status).toBe(404)
    expect((await api(key, `/documents/${theirs.id}`)).status).toBe(404)

    const { key: freeKey } = await createKey(mallory)
    const { document } = (await (await uploadViaApi(freeKey)).json()) as {
      document: { id: string }
    }
    const send = () =>
      api(freeKey, "/envelopes", {
        method: "POST",
        json: {
          documentId: document.id,
          title: "Q",
          recipients: [{ name: "S", email: "s@example.test" }],
          fields: [
            { recipient: 0, type: "SIGNATURE", page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
          ],
          send: true,
        },
      })
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(201)
    const over = await send()
    expect(over.status).toBe(402)
    expect(((await over.json()) as { error: string }).error).toBe("quota_exceeded")
  })
})
