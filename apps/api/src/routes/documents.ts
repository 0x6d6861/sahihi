import {
  CreateUploadSchema,
  canDeleteDocument,
  DOCUMENTS_PAGE_SIZE,
  ListDocumentsQuerySchema,
  MAX_UPLOAD_BYTES,
  sha256Hex,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import {
  deleteObject,
  getObjectBytes,
  headObject,
  keys,
  presignDownload,
  presignUpload,
} from "@sahihi/infra"
import { inspectPdf, PdfInspectionError } from "@sahihi/pdf"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { badRequest, conflict, notFound, parseJson, parseQuery } from "../lib/http"
import { actor, assertCanDeleteDocument } from "../lib/permissions"
import { requireOrg } from "../middleware/session"

/**
 * Upload flow (docs/pdf-pipeline.md):
 *   1. POST /documents/uploads   → Document(UPLOADING) + presigned PUT URL
 *   2. client PUTs bytes directly to S3
 *   3. POST /documents/:id/complete → server downloads, validates, hashes → READY | FAILED
 */
export const documents = new Hono<AppEnv>()
  .use(requireOrg)

  .post("/uploads", async (c) => {
    const input = await parseJson(c, CreateUploadSchema)
    const orgId = c.get("organizationId")
    if (input.sourceDocumentId) {
      // Lineage only within the caller's org, and only from finished documents.
      const source = await prisma.document.findFirst({
        where: forOrganization(orgId).document({ id: input.sourceDocumentId, status: "READY" }),
        select: { id: true },
      })
      if (!source) notFound("Source document")
    }
    const id = crypto.randomUUID()
    const s3Key = keys.original(orgId, id)
    const document = await prisma.document.create({
      data: {
        id,
        organizationId: orgId,
        uploadedById: c.get("user").id,
        name: input.name,
        s3Key,
        sizeBytes: input.sizeBytes,
        sourceDocumentId: input.sourceDocumentId ?? null,
      },
    })
    const uploadUrl = await presignUpload(s3Key, input.contentType, input.sizeBytes)
    return c.json({ document, uploadUrl }, 201)
  })

  .post("/:id/complete", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: c.req.param("id") }),
    })
    if (!doc) notFound("Document")
    if (doc.status !== "UPLOADING") conflict(`Document is already ${doc.status}`)

    const head = await headObject(doc.s3Key)
    if (!head) badRequest("Upload not found in storage")
    if (head.sizeBytes > MAX_UPLOAD_BYTES) badRequest("File too large")

    const bytes = await getObjectBytes(doc.s3Key)
    try {
      const info = await inspectPdf(bytes)
      const updated = await prisma.document.update({
        where: { id: doc.id },
        data: {
          status: "READY",
          sha256: await sha256Hex(bytes),
          sizeBytes: bytes.byteLength,
          pageCount: info.pageCount,
          pages: info.pages as unknown as object,
        },
      })
      return c.json({ document: updated })
    } catch (err) {
      if (!(err instanceof PdfInspectionError)) throw err
      const failed = await prisma.document.update({
        where: { id: doc.id },
        data: { status: "FAILED", failureReason: err.message },
      })
      await deleteObject(doc.s3Key).catch(() => {})
      return c.json({ document: failed, error: err.code }, 422)
    }
  })

  .get("/", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const { page } = parseQuery(c, ListDocumentsQuerySchema)
    const pageSize = DOCUMENTS_PAGE_SIZE
    const where = scope.document({ status: { not: "UPLOADING" } })
    const [items, total] = await prisma.$transaction([
      prisma.document.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { envelopes: true } },
          source: { select: { id: true, name: true, deletedAt: true } },
        },
      }),
      prisma.document.count({ where }),
    ])
    return c.json({ items, page, pageSize, total })
  })

  .get("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: c.req.param("id") }),
      include: { source: { select: { id: true, name: true, deletedAt: true } } },
    })
    if (!doc) notFound("Document")
    return c.json({ document: doc, permissions: { delete: canDeleteDocument(actor(c), doc) } })
  })

  /** Short-lived URL the PDF viewer loads. */
  .get("/:id/file", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: c.req.param("id"), status: "READY" }),
    })
    if (!doc) notFound("Document")
    return c.json({ url: await presignDownload(doc.s3Key, { fileName: doc.name }) })
  })

  .delete("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: c.req.param("id") }),
      include: { envelopes: { where: { status: { not: "DRAFT" } }, select: { id: true } } },
    })
    if (!doc) notFound("Document")
    assertCanDeleteDocument(c, doc)
    // A template carries its document (its fields are placed on these pages).
    const usedBy = await prisma.template.count({ where: { documentId: doc.id } })
    if (usedBy > 0) {
      conflict(
        `Used by ${usedBy} template${usedBy === 1 ? "" : "s"}. Delete ${usedBy === 1 ? "it" : "them"} first.`,
      )
    }
    // Sent envelopes reference the original forever (evidence). Soft delete only.
    await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } })
    if (doc.envelopes.length === 0) {
      await deleteObject(doc.s3Key).catch(() => {})
    }
    return c.body(null, 204)
  })
