import { beforeAll, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { app, createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

/**
 * docs/security.md → Tenant isolation. Every route that reads or writes tenant data is called as
 * the owner of ANOTHER organization, with a valid body, against alice's ids. Each must answer
 * 404 (never 403, so ids don't leak), lists must not include alice's rows, and alice's data must
 * be byte-for-byte unchanged afterwards.
 *
 * The route table below must classify every route the app serves. Adding a route without a case
 * here fails the "every route is classified" test.
 */

let alice: Sender
let mallory: Sender
const ids = { document: "", envelope: "", recipient: "" }

type Case = () => { path: string; init?: RequestInit & { json?: unknown } }

const TENANT: Record<string, Case> = {
  "POST /api/documents/uploads": () => ({
    path: "/api/documents/uploads",
    init: {
      method: "POST",
      json: {
        name: "copy.pdf",
        sizeBytes: 1000,
        contentType: "application/pdf",
        sourceDocumentId: ids.document,
      },
    },
  }),
  "POST /api/documents/:id/complete": () => ({
    path: `/api/documents/${ids.document}/complete`,
    init: { method: "POST" },
  }),
  "GET /api/documents/:id": () => ({ path: `/api/documents/${ids.document}` }),
  "GET /api/documents/:id/file": () => ({ path: `/api/documents/${ids.document}/file` }),
  "DELETE /api/documents/:id": () => ({
    path: `/api/documents/${ids.document}`,
    init: { method: "DELETE" },
  }),
  "POST /api/envelopes": () => ({
    path: "/api/envelopes",
    init: { method: "POST", json: { documentId: ids.document, title: "Stolen" } },
  }),
  "GET /api/envelopes/:id": () => ({ path: `/api/envelopes/${ids.envelope}` }),
  "PUT /api/envelopes/:id/recipients": () => ({
    path: `/api/envelopes/${ids.envelope}/recipients`,
    init: {
      method: "PUT",
      json: { recipients: [{ name: "Mallory", email: "mallory@example.test" }] },
    },
  }),
  "PUT /api/envelopes/:id/fields": () => ({
    path: `/api/envelopes/${ids.envelope}/fields`,
    init: {
      method: "PUT",
      json: {
        fields: [
          {
            recipientId: ids.recipient,
            type: "SIGNATURE",
            page: 1,
            x: 0.5,
            y: 0.5,
            width: 0.2,
            height: 0.05,
          },
        ],
      },
    },
  }),
  "GET /api/envelopes/:id/preflight": () => ({ path: `/api/envelopes/${ids.envelope}/preflight` }),
  "POST /api/envelopes/:id/send": () => ({
    path: `/api/envelopes/${ids.envelope}/send`,
    init: { method: "POST" },
  }),
  "POST /api/envelopes/:id/void": () => ({
    path: `/api/envelopes/${ids.envelope}/void`,
    init: { method: "POST", json: { reason: "Cross-tenant" } },
  }),
  "POST /api/envelopes/:id/recipients/:recipientId/remind": () => ({
    path: `/api/envelopes/${ids.envelope}/recipients/${ids.recipient}/remind`,
    init: { method: "POST" },
  }),
  "GET /api/envelopes/:id/audit": () => ({ path: `/api/envelopes/${ids.envelope}/audit` }),
  "GET /api/envelopes/:id/downloads": () => ({ path: `/api/envelopes/${ids.envelope}/downloads` }),
}

/** Org-scoped lists: 200, but only the caller's rows. */
const LISTS = ["GET /api/documents", "GET /api/envelopes"]

/**
 * Not org-scoped, each for a stated reason. Signing routes are authorized by the token alone
 * (signing-*.itest.ts), verify is public by design (verify.itest.ts), auth is better-auth's
 * (members.itest.ts / permissions.itest.ts).
 */
const NOT_TENANT = [
  "GET /health",
  "GET /api/auth/*",
  "POST /api/auth/*",
  "GET /api/sign/:token",
  "GET /api/sign/:token/downloads",
  "POST /api/sign/:token/otp",
  "POST /api/sign/:token/otp/verify",
  "GET /api/sign/:token/file",
  "POST /api/sign/:token/submit",
  "POST /api/sign/:token/decline",
  "GET /api/verify/:code",
  "POST /api/verify/hash",
]

/** Everything of alice's that a cross-tenant request could touch. */
async function snapshot() {
  const [documents, envelopes, recipients, fields, auditEvents] = await Promise.all([
    prisma.document.findMany({
      where: { organizationId: alice.organizationId },
      orderBy: { id: "asc" },
    }),
    prisma.envelope.findMany({
      where: { organizationId: alice.organizationId },
      orderBy: { id: "asc" },
    }),
    prisma.recipient.findMany({ where: { envelopeId: ids.envelope }, orderBy: { id: "asc" } }),
    prisma.field.findMany({ where: { envelopeId: ids.envelope }, orderBy: { id: "asc" } }),
    prisma.auditEvent.findMany({ where: { envelopeId: ids.envelope }, orderBy: { seq: "asc" } }),
  ])
  return { documents, envelopes, recipients, fields, auditEvents }
}

beforeAll(async () => {
  await resetDb()
  alice = await createSender("alice")
  mallory = await createSender("mallory") // an owner of her own org: roles never help across orgs
  const { document } = await uploadDocument(alice)
  ids.document = document.id
  const created = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Alice's lease" },
  })
  ids.envelope = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const put = await request(alice, `/api/envelopes/${ids.envelope}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Tenant", email: "tenant@example.test" }] },
  })
  const [recipient] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  if (!recipient) throw new Error("no recipient")
  ids.recipient = recipient.id
})

describe("tenant isolation", () => {
  test("every route is classified (tenant, list or not tenant-scoped)", () => {
    const served = [
      ...new Set(app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`)),
    ].sort()
    const classified = [...Object.keys(TENANT), ...LISTS, ...NOT_TENANT].sort()
    expect(served).toEqual(classified)
  })

  test("another org's owner gets 404 on every tenant route, and nothing changes", async () => {
    const before = await snapshot()
    for (const [route, build] of Object.entries(TENANT)) {
      const { path, init } = build()
      const res = await request(mallory, path, init)
      expect({ route, status: res.status }).toEqual({ route, status: 404 })
    }
    expect(await snapshot()).toEqual(before)
    // Mallory's org gained nothing either (no copies, no envelopes on alice's document).
    expect(await prisma.document.count({ where: { organizationId: mallory.organizationId } })).toBe(
      0,
    )
    expect(await prisma.envelope.count({ where: { organizationId: mallory.organizationId } })).toBe(
      0,
    )
  })

  test("lists only return the caller's rows", async () => {
    for (const path of ["/api/documents", "/api/envelopes"]) {
      const mine = (await (await request(alice, path)).json()) as { items: unknown[] }
      const theirs = (await (await request(mallory, path)).json()) as { items: unknown[] }
      expect({ path, alice: mine.items.length > 0, mallory: theirs.items.length }).toEqual({
        path,
        alice: true,
        mallory: 0,
      })
    }
  })

  test("the owner still reaches everything (the 404s are the scope, not broken fixtures)", async () => {
    for (const path of [
      `/api/documents/${ids.document}`,
      `/api/documents/${ids.document}/file`,
      `/api/envelopes/${ids.envelope}`,
      `/api/envelopes/${ids.envelope}/preflight`,
      `/api/envelopes/${ids.envelope}/audit`,
    ]) {
      expect({ path, status: (await request(alice, path)).status }).toEqual({ path, status: 200 })
    }
  })
})
