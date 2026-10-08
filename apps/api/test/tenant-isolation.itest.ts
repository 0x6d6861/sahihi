import { beforeAll, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { putObject } from "@sahihi/infra"
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
const ids = {
  document: "",
  envelope: "",
  recipient: "",
  template: "",
  role: "",
  webhook: "",
  delivery: "",
  export: "",
  apiKey: "",
  bulkSend: "",
  folder: "",
  envelopeDocument: "",
  attachment: "",
}

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
  "GET /api/documents/:id/field-suggestions": () => ({
    path: `/api/documents/${ids.document}/field-suggestions`,
  }),
  "DELETE /api/documents/:id": () => ({
    path: `/api/documents/${ids.document}`,
    init: { method: "DELETE" },
  }),
  "POST /api/envelopes": () => ({
    path: "/api/envelopes",
    init: { method: "POST", json: { documentId: ids.document, title: "Stolen" } },
  }),
  "GET /api/envelopes/:id": () => ({ path: `/api/envelopes/${ids.envelope}` }),
  "PUT /api/envelopes/:id/document": () => ({
    path: `/api/envelopes/${ids.envelope}/document`,
    init: { method: "PUT", json: { documentId: ids.document } },
  }),
  "PUT /api/envelopes/:id/details": () => ({
    path: `/api/envelopes/${ids.envelope}/details`,
    init: {
      method: "PUT",
      json: { title: "Stolen", signingOrder: "PARALLEL", expiresAt: null },
    },
  }),
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
  // Multi-document envelopes and supporting files (ADR 0037).
  "POST /api/envelopes/:id/documents": () => ({
    path: `/api/envelopes/${ids.envelope}/documents`,
    init: { method: "POST", json: { documentIds: [ids.document] } },
  }),
  "DELETE /api/envelopes/:id/documents/:envelopeDocumentId": () => ({
    path: `/api/envelopes/${ids.envelope}/documents/${ids.envelopeDocument}`,
    init: { method: "DELETE" },
  }),
  "PUT /api/envelopes/:id/documents/order": () => ({
    path: `/api/envelopes/${ids.envelope}/documents/order`,
    init: { method: "PUT", json: { envelopeDocumentIds: [ids.envelopeDocument] } },
  }),
  "POST /api/envelopes/:id/attachments/uploads": () => ({
    path: `/api/envelopes/${ids.envelope}/attachments/uploads`,
    init: {
      method: "POST",
      json: { name: "prices.csv", sizeBytes: 10, contentType: "text/csv" },
    },
  }),
  "POST /api/envelopes/:id/attachments/:attachmentId/complete": () => ({
    path: `/api/envelopes/${ids.envelope}/attachments/${ids.attachment}/complete`,
    init: { method: "POST" },
  }),
  "DELETE /api/envelopes/:id/attachments/:attachmentId": () => ({
    path: `/api/envelopes/${ids.envelope}/attachments/${ids.attachment}`,
    init: { method: "DELETE" },
  }),
  "GET /api/envelopes/:id/attachments/:attachmentId/file": () => ({
    path: `/api/envelopes/${ids.envelope}/attachments/${ids.attachment}/file`,
  }),
  "POST /api/templates": () => ({
    path: "/api/templates",
    init: {
      method: "POST",
      json: {
        envelopeId: ids.envelope,
        name: "Stolen",
        roles: [{ recipientId: ids.recipient, label: "Tenant" }],
      },
    },
  }),
  "GET /api/templates/:id": () => ({ path: `/api/templates/${ids.template}` }),
  "PATCH /api/templates/:id": () => ({
    path: `/api/templates/${ids.template}`,
    init: { method: "PATCH", json: { name: "Renamed" } },
  }),
  "DELETE /api/templates/:id": () => ({
    path: `/api/templates/${ids.template}`,
    init: { method: "DELETE" },
  }),
  "POST /api/envelopes/:id/purge": () => ({
    path: `/api/envelopes/${ids.envelope}/purge`,
    init: { method: "POST" },
  }),
  "GET /api/data/exports/:id/download": () => ({
    path: `/api/data/exports/${ids.export}/download`,
  }),
  "POST /api/templates/:id/bulk-sends": () => ({
    path: `/api/templates/${ids.template}/bulk-sends`,
    init: {
      method: "POST",
      json: {
        title: "Stolen",
        rows: [
          { recipients: [{ roleId: ids.role, name: "Mallory", email: "mallory@example.test" }] },
        ],
      },
    },
  }),
  "GET /api/bulk-sends/:id": () => ({ path: `/api/bulk-sends/${ids.bulkSend}` }),
  "DELETE /api/api-keys/:id": () => ({
    path: `/api/api-keys/${ids.apiKey}`,
    init: { method: "DELETE" },
  }),
  "PATCH /api/webhooks/:id": () => ({
    path: `/api/webhooks/${ids.webhook}`,
    init: { method: "PATCH", json: { url: "https://attacker.example/hook" } },
  }),
  "DELETE /api/webhooks/:id": () => ({
    path: `/api/webhooks/${ids.webhook}`,
    init: { method: "DELETE" },
  }),
  "POST /api/webhooks/:id/rotate-secret": () => ({
    path: `/api/webhooks/${ids.webhook}/rotate-secret`,
    init: { method: "POST" },
  }),
  "POST /api/webhooks/:id/test": () => ({
    path: `/api/webhooks/${ids.webhook}/test`,
    init: { method: "POST" },
  }),
  "POST /api/webhooks/:id/deliveries/:deliveryId/retry": () => ({
    path: `/api/webhooks/${ids.webhook}/deliveries/${ids.delivery}/retry`,
    init: { method: "POST" },
  }),
  "PATCH /api/envelopes/:id/labels": () => ({
    path: `/api/envelopes/${ids.envelope}/labels`,
    init: { method: "PATCH", json: { folderId: null } },
  }),
  "PATCH /api/documents/:id": () => ({
    path: `/api/documents/${ids.document}`,
    init: { method: "PATCH", json: { folderId: null } },
  }),
  // Creating is in the caller's org, but the parent id must be theirs too.
  "POST /api/folders": () => ({
    path: "/api/folders",
    init: { method: "POST", json: { name: "Inside Alice's", parentId: ids.folder } },
  }),
  "PATCH /api/folders/:id": () => ({
    path: `/api/folders/${ids.folder}`,
    init: { method: "PATCH", json: { name: "Renamed" } },
  }),
  "DELETE /api/folders/:id": () => ({
    path: `/api/folders/${ids.folder}`,
    init: { method: "DELETE" },
  }),
  // Every item and the target must be the caller's (ADR 0039).
  "POST /api/files/move": () => ({
    path: "/api/files/move",
    init: {
      method: "POST",
      json: {
        items: [
          { kind: "document", id: ids.document },
          { kind: "folder", id: ids.folder },
        ],
        folderId: null,
      },
    },
  }),
  "POST /api/files/group": () => ({
    path: "/api/files/group",
    init: {
      method: "POST",
      json: {
        items: [
          { kind: "document", id: ids.document },
          { kind: "envelope", id: ids.envelope },
        ],
        parentId: null,
      },
    },
  }),
  "POST /api/templates/:id/envelopes": () => ({
    path: `/api/templates/${ids.template}/envelopes`,
    init: {
      method: "POST",
      json: {
        title: "Stolen",
        recipients: [{ roleId: ids.role, name: "Mallory", email: "mallory@example.test" }],
      },
    },
  }),
}

/** Org-scoped lists: 200, but only the caller's rows. */
const LISTS = [
  "GET /api/documents",
  "GET /api/folders",
  "GET /api/files",
  "GET /api/envelopes",
  "GET /api/templates",
  "GET /api/webhooks",
  "GET /api/data/exports",
  "GET /api/bulk-sends",
  "GET /api/notifications",
]

/**
 * Not org-scoped, each for a stated reason. Signing routes are authorized by the token alone
 * (signing-*.itest.ts), verify is public by design (verify.itest.ts), auth is better-auth's
 * (members.itest.ts / permissions.itest.ts).
 */
/**
 * The staff-only queue dashboard isn't tenant data: it sits behind its own basic auth, redacts
 * job data and only allows retries (observability.itest.ts).
 */
/**
 * The public API authenticates by API key, not session: its cross-workspace 404s are covered in
 * public-api.itest.ts.
 */
const isPublicApi = (route: string) => route.split(" ")[1]?.startsWith("/api/v1")

const isStaffDashboard = (route: string) =>
  route.split(" ")[1]?.startsWith("/admin/queues/") || route.endsWith(" /admin/queues")

const NOT_TENANT = [
  // Creates in the caller's own org and takes no ids from the request.
  "POST /api/webhooks",
  // The caller's own workspace plan and usage; takes no ids.
  "GET /api/billing",
  // The caller's own embedding origins (docs/embedded-signing.md); no ids.
  "GET /api/embedding",
  "PUT /api/embedding",
  // The caller's own API keys (list / create); no ids.
  "GET /api/api-keys",
  "POST /api/api-keys",
  // The caller's own workspace data settings / a new export of their own data; no ids.
  "GET /api/data/settings",
  "PUT /api/data/settings",
  "POST /api/data/exports",
  // The caller's own saved signature, keyed by their user id; no ids (account.itest.ts).
  "GET /api/me/signatures",
  "PUT /api/me/signatures",
  "DELETE /api/me/signatures/:kind",
  "PUT /api/me/avatar",
  "DELETE /api/me/avatar",
  // Account deletion (ADR 0040): the caller's own account; confirming is public (emailed token).
  "GET /api/me/deletion",
  "POST /api/me/deletion",
  "POST /api/account/delete",
  // The caller's own notifications in their workspace, keyed by user and org; ids from the body
  // only ever match the caller's rows (notifications.itest.ts).
  "GET /api/notifications/unread-count",
  "POST /api/notifications/read",
  "POST /api/notifications/unread",
  "POST /api/notifications/dismiss",
  "GET /api/notifications/preferences",
  "PUT /api/notifications/preferences",
  // A user's picture, for themselves and people sharing a workspace (account.itest.ts).
  "GET /api/avatars/:userId",
  // The caller's own workspace logo; no ids.
  "PUT /api/workspace/logo",
  "DELETE /api/workspace/logo",
  // Public logo of any workspace, by design (ADR 0028); serves nothing else.
  "GET /api/branding/:orgId/logo.png",
  "GET /health",
  "GET /api/auth/*",
  "POST /api/auth/*",
  "GET /api/sign/:token",
  "GET /api/sign/:token/downloads",
  "GET /api/sign/:token/attachments/:attachmentId",
  "GET /api/sign/:token/embed",
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
  const [
    documents,
    envelopes,
    recipients,
    fields,
    auditEvents,
    templates,
    webhooks,
    apiKeys,
    folders,
    envelopeDocuments,
    attachments,
  ] = await Promise.all([
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
    prisma.template.findMany({
      where: { organizationId: alice.organizationId },
      include: { roles: true, fields: true },
    }),
    prisma.webhookEndpoint.findMany({
      where: { organizationId: alice.organizationId },
      include: { deliveries: true },
    }),
    prisma.apiKey.findMany({ where: { organizationId: alice.organizationId } }),
    prisma.folder.findMany({ where: { organizationId: alice.organizationId } }),
    prisma.envelopeDocument.findMany({
      where: { envelopeId: ids.envelope },
      orderBy: { id: "asc" },
    }),
    prisma.envelopeAttachment.findMany({
      where: { envelopeId: ids.envelope },
      orderBy: { id: "asc" },
    }),
  ])
  return {
    documents,
    envelopes,
    recipients,
    fields,
    auditEvents,
    templates,
    webhooks,
    apiKeys,
    folders,
    envelopeDocuments,
    attachments,
  }
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
  ids.envelopeDocument = (
    await prisma.envelopeDocument.findFirstOrThrow({ where: { envelopeId: ids.envelope } })
  ).id
  const attachmentKey = `org/${alice.organizationId}/envelopes/${ids.envelope}/attachments/x`
  await putObject(attachmentKey, new TextEncoder().encode("a,b\n1,2\n"), "text/csv")
  ids.attachment = (
    await prisma.envelopeAttachment.create({
      data: {
        envelopeId: ids.envelope,
        name: "prices.csv",
        contentType: "text/csv",
        sizeBytes: 10,
        sha256: "a".repeat(64),
        s3Key: attachmentKey,
        status: "READY",
        uploadedById: alice.userId,
      },
    })
  ).id
  const put = await request(alice, `/api/envelopes/${ids.envelope}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Tenant", email: "tenant@example.test" }] },
  })
  const [recipient] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  if (!recipient) throw new Error("no recipient")
  ids.recipient = recipient.id
  const saved = await request(alice, "/api/templates", {
    method: "POST",
    json: {
      envelopeId: ids.envelope,
      name: "Alice's lease",
      roles: [{ recipientId: recipient.id, label: "Tenant" }],
    },
  })
  ids.template = ((await saved.json()) as { template: { id: string } }).template.id
  const tpl = (await (await request(alice, `/api/templates/${ids.template}`)).json()) as {
    template: { roles: { id: string }[] }
  }
  ids.role = tpl.template.roles[0]?.id ?? ""
  const hook = await request(alice, "/api/webhooks", {
    method: "POST",
    json: { url: "https://hooks.example.test/alice", events: ["envelope.sent"] },
  })
  ids.webhook = ((await hook.json()) as { endpoint: { id: string } }).endpoint.id
  const tested = await request(alice, `/api/webhooks/${ids.webhook}/test`, { method: "POST" })
  ids.delivery = ((await tested.json()) as { delivery: { id: string } }).delivery.id
  const exp = await prisma.dataExport.create({
    data: {
      organizationId: alice.organizationId,
      requestedById: alice.userId,
      status: "READY",
      s3Key: `org/${alice.organizationId}/exports/x.zip`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  })
  ids.export = exp.id
  const key = await request(alice, "/api/api-keys", {
    method: "POST",
    json: { name: "Alice's ERP", scopes: ["envelopes:read"] },
  })
  ids.apiKey = ((await key.json()) as { apiKey: { id: string } }).apiKey.id
  const bulk = await prisma.bulkSend.create({
    data: {
      organizationId: alice.organizationId,
      templateId: ids.template,
      createdById: alice.userId,
      title: "Alice's batch",
      total: 0,
      status: "DONE",
    },
  })
  ids.bulkSend = bulk.id
  const folder = await request(alice, "/api/folders", { method: "POST", json: { name: "Leases" } })
  ids.folder = ((await folder.json()) as { folder: { id: string } }).folder.id
  // A failed delivery, so "retry" would otherwise be allowed.
  await prisma.webhookDelivery.update({ where: { id: ids.delivery }, data: { status: "FAILED" } })
})

describe("tenant isolation", () => {
  test("every route is classified (tenant, list or not tenant-scoped)", () => {
    const served = [
      ...new Set(
        app.routes
          .filter((r) => r.method !== "ALL")
          .map((r) => `${r.method} ${r.path}`)
          .filter((route) => !isStaffDashboard(route) && !isPublicApi(route)),
      ),
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
    expect(await prisma.folder.count({ where: { organizationId: mallory.organizationId } })).toBe(0)
  })

  test("another org's folder ids are unknown in query strings and bodies", async () => {
    for (const path of [
      `/api/folders?parentId=${ids.folder}`,
      `/api/documents?folderId=${ids.folder}`,
    ]) {
      expect({ path, status: (await request(mallory, path)).status }).toEqual({ path, status: 404 })
    }
    const upload = await request(mallory, "/api/documents/uploads", {
      method: "POST",
      json: { name: "x.pdf", sizeBytes: 100, contentType: "application/pdf", folderId: ids.folder },
    })
    expect(upload.status).toBe(404)
  })

  test("lists only return the caller's rows", async () => {
    for (const path of [
      "/api/documents",
      "/api/folders",
      "/api/envelopes",
      "/api/templates",
      "/api/webhooks",
      "/api/data/exports",
      "/api/bulk-sends",
    ]) {
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
      `/api/templates/${ids.template}`,
    ]) {
      expect({ path, status: (await request(alice, path)).status }).toEqual({ path, status: 200 })
    }
  })
})
