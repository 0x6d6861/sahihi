import {
  anchorRanges,
  CreateUploadSchema,
  canDeleteDocument,
  canMoveDocument,
  createTextRuleScanner,
  DOCUMENTS_PAGE_SIZE,
  ListDocumentsQuerySchema,
  MAX_UPLOAD_BYTES,
  mergeSuggestions,
  type PageBox,
  sha256Hex,
  suggestFieldsFromAnchors,
  suggestFieldsFromForm,
  suggestFieldsFromText,
  UpdateDocumentSchema,
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
import { inspectPdf, PdfInspectionError, readFormWidgets, readPageText } from "@sahihi/pdf"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { loadFolderTree } from "../lib/folder-tree"
import { badRequest, conflict, notFound, parseJson, parseQuery } from "../lib/http"
import { colorsInUse, resolveTags, TAG_SELECT, tagsInUse } from "../lib/labels"
import { documentWhere } from "../lib/list-filters"
import { documentListInclude, documentListItem } from "../lib/list-items"
import { actor, assertCanDeleteDocument, assertCanMoveDocument } from "../lib/permissions"
import { queueThumbnail } from "../lib/thumbnails"
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
    if (input.folderId) {
      const folder = await prisma.folder.findFirst({
        where: forOrganization(orgId).folder({ id: input.folderId }),
        select: { id: true },
      })
      if (!folder) notFound("Folder")
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
        folderId: input.folderId ?? null,
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
      await queueThumbnail(updated.id)
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

  /**
   * One folder's documents (root when `folderId` is omitted), newest first. `q` (names and tags),
   * `tag` and `color` search every folder; `status`, `senderId` and `period` narrow either view
   * (ADR 0022, 0025).
   */
  .get("/", async (c) => {
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const query = parseQuery(c, ListDocumentsQuerySchema)
    const pageSize = DOCUMENTS_PAGE_SIZE
    if (query.folderId) {
      const folder = await prisma.folder.findFirst({
        where: scope.folder({ id: query.folderId }),
        select: { id: true },
      })
      if (!folder) notFound("Folder")
    }
    const filters = documentWhere({ ...query, ownerId: query.senderId })
    const where = scope.document(filters)
    const [items, total, senders, tags] = await prisma.$transaction([
      prisma.document.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
        include: documentListInclude,
      }),
      prisma.document.count({ where }),
      // "Sender" filter options: everyone who uploaded a listed document in this workspace.
      prisma.user.findMany({
        where: { documents: { some: scope.document({ status: { not: "UPLOADING" } }) } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // "Tag" filter options and the tag picker's suggestions.
      tagsInUse(orgId),
    ])
    const me = actor(c)
    return c.json({
      items: await Promise.all(items.map((d) => documentListItem(d, me))),
      page: query.page,
      pageSize,
      total,
      senders,
      tags,
      // Color filter options.
      colors: await colorsInUse(orgId),
    })
  })

  .get("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: c.req.param("id") }),
      include: {
        source: { select: { id: true, name: true, deletedAt: true } },
        tags: TAG_SELECT,
      },
    })
    if (!doc) notFound("Document")
    const me = actor(c)
    // Where it lives, root first, for the breadcrumb ([] at the top level).
    const folderPath = doc.folderId
      ? (await loadFolderTree(c.get("organizationId"))).pathOf(doc.folderId)
      : []
    return c.json({
      document: doc,
      folderPath,
      permissions: { delete: canDeleteDocument(me, doc), label: canMoveDocument(me, doc) },
    })
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

  /**
   * Detected fields (ADR 0020): anchor tags like `{{s1:signature}}` and the PDF's own form widgets;
   * only when neither finds anything, labels next to signature lines ("Signature: ____"), which
   * are a guess. One PDFium pass serves both text detectors. Read-only: the editor shows them and
   * the sender decides what to keep. Rects are normalized (docs/coordinates.md).
   */
  .get("/:id/field-suggestions", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: c.req.param("id"), status: "READY" }),
      select: { s3Key: true, pages: true },
    })
    if (!doc) notFound("Document")
    const bytes = await getObjectBytes(doc.s3Key)
    const pages = (doc.pages ?? []) as unknown as PageBox[]
    const scanRules = createTextRuleScanner()
    const text = await readPageText(bytes, {
      measure: (t, lines) => [...anchorRanges(t), ...scanRules(t, lines)],
      lines: true,
    })
    const anchors = suggestFieldsFromAnchors(text, pages)
    const form = suggestFieldsFromForm(await readFormWidgets(bytes), pages)
    const rules =
      anchors.suggestions.length + form.suggestions.length === 0
        ? suggestFieldsFromText(text, pages).suggestions
        : []
    return c.json({
      suggestions: mergeSuggestions(anchors.suggestions, form.suggestions, rules),
      skipped: anchors.skipped + form.skipped,
    })
  })

  /**
   * Rename, move to a folder (`folderId: null` = root) and/or set the colour and tags (ADR 0025).
   * Moving and labelling are organisation only. A rename is refused (409) once a sent envelope
   * uses the document: signers and the certificate show its name.
   */
  .patch("/:id", async (c) => {
    const input = await parseJson(c, UpdateDocumentSchema)
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: c.req.param("id"), status: { not: "UPLOADING" } }),
      select: { id: true, uploadedById: true, name: true },
    })
    if (!doc) notFound("Document")
    assertCanMoveDocument(c, doc)
    if (input.name !== undefined && input.name !== doc.name) {
      const sent = await prisma.envelope.count({
        where: scope.envelope({
          documents: { some: { documentId: doc.id } },
          status: { not: "DRAFT" },
        }),
      })
      if (sent > 0) conflict("This document was sent for signature, so its name can't change")
    }
    if (input.folderId) {
      const folder = await prisma.folder.findFirst({
        where: scope.folder({ id: input.folderId }),
        select: { id: true },
      })
      if (!folder) notFound("Folder")
    }
    const tags = input.tags && (await resolveTags(orgId, input.tags))
    const document = await prisma.document.update({
      where: { id: doc.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.folderId !== undefined && { folderId: input.folderId }),
        ...(input.color !== undefined && { color: input.color }),
        ...(tags && { tags: { set: tags } }),
      },
      select: { id: true, name: true, folderId: true, color: true, tags: TAG_SELECT },
    })
    return c.json({ document })
  })

  .delete("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: c.req.param("id") }),
      include: {
        envelopeDocuments: {
          where: { envelope: { status: { not: "DRAFT" } } },
          select: { id: true },
        },
      },
    })
    if (!doc) notFound("Document")
    assertCanDeleteDocument(c, doc)
    // A template carries its document (its fields are placed on these pages).
    const usedBy = await prisma.template.count({
      where: { documents: { some: { documentId: doc.id } } },
    })
    if (usedBy > 0) {
      conflict(
        `Used by ${usedBy} template${usedBy === 1 ? "" : "s"}. Delete ${usedBy === 1 ? "it" : "them"} first.`,
      )
    }
    // Sent envelopes reference the original forever (evidence). Soft delete only.
    await prisma.document.update({
      where: { id: doc.id },
      data: { deletedAt: new Date(), thumbnailKey: null },
    })
    // The preview only serves the Documents list, which no longer shows it.
    if (doc.thumbnailKey) await deleteObject(doc.thumbnailKey).catch(() => {})
    if (doc.envelopeDocuments.length === 0) {
      await deleteObject(doc.s3Key).catch(() => {})
    }
    return c.body(null, 204)
  })
