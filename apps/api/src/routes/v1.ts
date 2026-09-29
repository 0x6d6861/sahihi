import { getEnv } from "@sahihi/config"
import {
  ApiCreateBulkSendSchema,
  ApiCreateEnvelopeSchema,
  ApiListEnvelopesQuerySchema,
  ApiVoidSchema,
  downloadFileName,
  envelopeEventData,
  MAX_UPLOAD_BYTES,
  sha256Hex,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import {
  type Actor,
  createEmbeddedSigningLink,
  createEnvelopeFromDocument,
  createEnvelopeFromTemplate,
  sendEnvelope,
  startBulkSend,
  voidEnvelope,
} from "@sahihi/envelopes"
import { deleteObject, keys, presignDownload, putObject } from "@sahihi/infra"
import { inspectPdf, PdfInspectionError } from "@sahihi/pdf"
import { type Context, Hono } from "hono"
import { clientMeta, conflict, notFound, parseJson, parseQuery } from "../lib/http"
import { type ApiKeyEnv, requireApiKey, requireScope } from "../middleware/api-key"
import { rateLimit } from "../middleware/rate-limit"
import { bulkItemSelect, bulkSendSelect } from "./bulk-sends"

/**
 * Public API v1 (docs/public-api.md). Authenticated by API key (Bearer), scoped per route,
 * rate-limited per key. Everything is confined to the key's workspace; other workspaces' ids
 * answer 404. Envelope bodies use the same shape as webhook payloads (`envelopeEventData`).
 */

const actorOf = (c: Context<ApiKeyEnv>): Actor => ({
  userId: c.get("apiKey").createdById,
  apiKeyId: c.get("apiKey").id,
  ...clientMeta(c),
})

async function envelopeView(organizationId: string, id: string) {
  const e = await prisma.envelope.findFirst({
    where: forOrganization(organizationId).envelope({ id }),
    include: {
      document: { select: { id: true, name: true, sha256: true } },
      certificate: { select: { code: true } },
      recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  })
  if (!e) notFound("Envelope")
  const view = envelopeEventData(e as NonNullable<typeof e>).envelope
  return { ...view, purged: Boolean(e?.purgedAt) }
}

const docView = (d: {
  id: string
  name: string
  status: string
  pageCount: number | null
  sha256: string | null
  createdAt: Date
}) => ({
  id: d.id,
  name: d.name,
  status: d.status,
  pageCount: d.pageCount,
  sha256: d.sha256,
  createdAt: d.createdAt,
})

export const v1 = new Hono<ApiKeyEnv>()
  // Per IP before auth (slows key guessing), then per key.
  .use("*", rateLimit({ bucket: "api-ip", limit: 1200, windowSec: 60 }))
  .use("*", requireApiKey)
  .use(
    "*",
    rateLimit({ bucket: "api-key", limit: 600, windowSec: 60, key: (c) => c.get("apiKey").id }),
  )

  /** Who am I: the workspace and this key's permissions. */
  .get("/", async (c) => {
    const org = await prisma.organization.findUnique({
      where: { id: c.get("organizationId") },
      select: { id: true, name: true },
    })
    const k = c.get("apiKey")
    return c.json({ organization: org, key: { id: k.id, name: k.name, scopes: k.scopes } })
  })

  // ── Documents ──────────────────────────────────────────────────────────────
  /** Upload a PDF: raw `application/pdf` body, `?name=contract.pdf`. Returns it READY. */
  .post("/documents", requireScope("documents:write"), async (c) => {
    const type = c.req.header("content-type") ?? ""
    if (!type.startsWith("application/pdf")) {
      return c.json(
        { error: "unsupported_media_type", message: "Send the PDF as application/pdf" },
        415,
      )
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
      return c.json({ error: "invalid_size", message: "The PDF must be 1 byte to 25 MB" }, 400)
    }
    const name = (c.req.query("name") ?? "document.pdf").trim().slice(0, 200) || "document.pdf"
    let info: Awaited<ReturnType<typeof inspectPdf>>
    try {
      info = await inspectPdf(bytes)
    } catch (err) {
      if (!(err instanceof PdfInspectionError)) throw err
      return c.json({ error: err.code, message: err.message }, 422)
    }
    const orgId = c.get("organizationId")
    const id = crypto.randomUUID()
    const s3Key = keys.original(orgId, id)
    await putObject(s3Key, bytes, "application/pdf")
    try {
      const doc = await prisma.document.create({
        data: {
          id,
          organizationId: orgId,
          uploadedById: c.get("apiKey").createdById,
          name,
          s3Key,
          status: "READY",
          sizeBytes: bytes.byteLength,
          sha256: await sha256Hex(bytes),
          pageCount: info.pageCount,
          pages: info.pages as unknown as object,
        },
      })
      return c.json({ document: docView(doc) }, 201)
    } catch (err) {
      await deleteObject(s3Key).catch(() => {})
      throw err
    }
  })

  .get("/documents/:id", requireScope("documents:read"), async (c) => {
    const doc = await prisma.document.findFirst({
      where: forOrganization(c.get("organizationId")).document({ id: c.req.param("id") }),
    })
    if (!doc) notFound("Document")
    return c.json({ document: docView(doc as NonNullable<typeof doc>) })
  })

  // ── Templates ──────────────────────────────────────────────────────────────
  .get("/templates", requireScope("templates:read"), async (c) => {
    const items = await prisma.template.findMany({
      where: forOrganization(c.get("organizationId")).template(),
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        description: true,
        signingOrder: true,
        createdAt: true,
        roles: {
          select: {
            id: true,
            label: true,
            role: true,
            order: true,
            verification: true,
            email: true,
          },
          orderBy: { order: "asc" },
        },
      },
    })
    // A role with a fixed contact needs no input when the template is used.
    return c.json({
      items: items.map((t) => ({
        ...t,
        roles: t.roles.map(({ email, ...r }) => ({ ...r, fixedContact: Boolean(email) })),
      })),
    })
  })

  // ── Envelopes ──────────────────────────────────────────────────────────────
  .get("/envelopes", requireScope("envelopes:read"), async (c) => {
    const { status, page } = parseQuery(c, ApiListEnvelopesQuerySchema)
    const where = forOrganization(c.get("organizationId")).envelope(status ? { status } : {})
    const pageSize = 50
    const [rows, total] = await prisma.$transaction([
      prisma.envelope.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          sentAt: true,
          completedAt: true,
        },
      }),
      prisma.envelope.count({ where }),
    ])
    return c.json({ items: rows, page, pageSize, total })
  })

  /**
   * Create an envelope in one call: `{ templateId, recipients: [{ roleId, name, email }] }` or
   * `{ documentId, recipients, fields }`; `send: true` sends it immediately (plan quota applies).
   */
  .post("/envelopes", requireScope("envelopes:write"), async (c) => {
    const input = await parseJson(c, ApiCreateEnvelopeSchema)
    const organizationId = c.get("organizationId")
    const actor = actorOf(c)
    const envelope =
      "templateId" in input
        ? await createEnvelopeFromTemplate({
            templateId: input.templateId,
            organizationId,
            actor,
            data: {
              title: input.title,
              message: input.message,
              expiresAt: input.expiresAt,
              recipients: input.recipients,
            },
          })
        : await createEnvelopeFromDocument({ organizationId, actor, data: input })
    if (input.send) await sendEnvelope({ envelopeId: envelope.id, organizationId, actor })
    return c.json({ envelope: await envelopeView(organizationId, envelope.id) }, 201)
  })

  .get("/envelopes/:id", requireScope("envelopes:read"), async (c) =>
    c.json({ envelope: await envelopeView(c.get("organizationId"), c.req.param("id")) }),
  )

  .post("/envelopes/:id/send", requireScope("envelopes:write"), async (c) => {
    const organizationId = c.get("organizationId")
    await sendEnvelope({ envelopeId: c.req.param("id"), organizationId, actor: actorOf(c) })
    return c.json({ envelope: await envelopeView(organizationId, c.req.param("id")) })
  })

  .post("/envelopes/:id/void", requireScope("envelopes:write"), async (c) => {
    const { reason } = await parseJson(c, ApiVoidSchema)
    const organizationId = c.get("organizationId")
    await voidEnvelope({ envelopeId: c.req.param("id"), organizationId, reason, actor: actorOf(c) })
    return c.json({ envelope: await envelopeView(organizationId, c.req.param("id")) })
  })

  /** Short-lived download links for the signed PDF and certificate (once finalized). */
  .get("/envelopes/:id/downloads", requireScope("envelopes:read"), async (c) => {
    const e = await prisma.envelope.findFirst({
      where: forOrganization(c.get("organizationId")).envelope({ id: c.req.param("id") }),
      include: { certificate: true },
    })
    if (!e) notFound("Envelope")
    const env = e as NonNullable<typeof e>
    if (env.purgedAt) {
      return c.json(
        { error: "purged", message: "These files were deleted under the data retention policy" },
        410,
      )
    }
    if (!env.signedS3Key || !env.certificate) conflict("Envelope is not finalized yet")
    return c.json({
      signed: await presignDownload(env.signedS3Key as string, {
        fileName: downloadFileName(env.title, "signed"),
        disposition: "attachment",
      }),
      certificate: await presignDownload((env.certificate as { s3Key: string }).s3Key, {
        fileName: downloadFileName(env.title, "certificate"),
        disposition: "attachment",
      }),
    })
  })

  // ── Bulk send ──────────────────────────────────────────────────────────────
  /** One envelope per row from a template; processed in the background (poll GET). */
  .post("/bulk-sends", requireScope("envelopes:write"), async (c) => {
    const { templateId, ...data } = await parseJson(c, ApiCreateBulkSendSchema)
    const bulk = await startBulkSend({
      templateId,
      organizationId: c.get("organizationId"),
      actor: actorOf(c),
      data,
    })
    return c.json({ bulkSend: { id: bulk.id, total: bulk.total, status: bulk.status } }, 202)
  })

  .get("/bulk-sends/:id", requireScope("envelopes:read"), async (c) => {
    const bulk = await prisma.bulkSend.findFirst({
      where: forOrganization(c.get("organizationId")).bulkSend({ id: c.req.param("id") }),
      select: { ...bulkSendSelect, items: { select: bulkItemSelect, orderBy: { row: "asc" } } },
    })
    if (!bulk) notFound("Bulk send")
    return c.json({ bulkSend: bulk })
  })

  // ── Embedded signing ───────────────────────────────────────────────────────
  /**
   * A signing URL for an EMBEDDED recipient whose turn it is (docs/embedded-signing.md). Show it in
   * an iframe on one of the workspace's allowed origins. Valid ~30 minutes; asking again rotates it.
   */
  .post(
    "/envelopes/:id/recipients/:recipientId/signing-url",
    requireScope("envelopes:write"),
    async (c) => {
      const { token, expiresAt } = await createEmbeddedSigningLink({
        envelopeId: c.req.param("id"),
        recipientId: c.req.param("recipientId"),
        organizationId: c.get("organizationId"),
        actor: actorOf(c),
      })
      return c.json({ url: `${getEnv().WEB_URL}/sign/${token}?embed=1`, expiresAt }, 201)
    },
  )
