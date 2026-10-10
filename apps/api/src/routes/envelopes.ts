import {
  AddEnvelopeDocumentsSchema,
  CreateAttachmentUploadSchema,
  CreateEnvelopeSchema,
  canManageEnvelope,
  ENVELOPES_PAGE_SIZE,
  hasPermission,
  isClosed,
  isEditable,
  ListEnvelopesQuerySchema,
  MAX_ATTACHMENTS,
  MAX_UPLOAD_BYTES,
  ReorderEnvelopeDocumentsSchema,
  ReplaceEnvelopeDocumentSchema,
  ReplaceFieldsSchema,
  ReplaceRecipientsSchema,
  reminderAvailability,
  sendPreflight,
  sha256Hex,
  UpdateEnvelopeDetailsSchema,
  UpdateEnvelopeLabelsSchema,
  VoidEnvelopeSchema,
  verifyAuditChain,
} from "@sahihi/core"
import { appendAuditEvent, forOrganization, prisma, toChainedEvent } from "@sahihi/db"
import {
  attachDocuments,
  documentsAuditData,
  EnvelopeError,
  loadReadyDocuments,
  lockedFields,
  replaceEnvelopeDocument,
  rotateRecipientLink,
  sendEnvelope,
  voidEnvelope,
} from "@sahihi/envelopes"
import {
  deleteObject,
  getObjectBytes,
  getQueues,
  headObject,
  keys,
  presignDownload,
  presignUpload,
} from "@sahihi/infra"
import { type Context, Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import type { AppEnv } from "../lib/env"
import {
  attachmentView,
  documentView,
  downloadLinks,
  envelopeAttachmentsSelect,
  envelopeDocumentsSelect,
  totalPages,
} from "../lib/envelope-documents"
import { assertFolderInOrg } from "../lib/folder-tree"
import {
  badRequest,
  clientMeta,
  conflict,
  forbidden,
  notFound,
  parseJson,
  parseQuery,
} from "../lib/http"
import { colorsInUse, resolveTags, TAG_SELECT, tagsInUse } from "../lib/labels"
import { envelopeWhere } from "../lib/list-filters"
import { envelopeListInclude, envelopeListItem } from "../lib/list-items"
import { actor, assertCanManageEnvelope } from "../lib/permissions"
import { requireOrg } from "../middleware/session"

/** 410 for files deleted under retention or on request (docs/data-retention.md). */
function gone(): never {
  throw new HTTPException(410, {
    res: Response.json(
      {
        error: "purged",
        message: "This envelope's files were deleted under the data retention policy",
      },
      { status: 410 },
    ),
  })
}

/** Never leak token hashes to clients. */
const recipientSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  order: true,
  status: true,
  verification: true,
  colorIndex: true,
  notifiedAt: true,
  lastRemindedAt: true,
  reminderCount: true,
  viewedAt: true,
  signedAt: true,
  declinedAt: true,
  declineReason: true,
} as const

/**
 * A draft the caller may edit, with its documents in order, or the matching HTTP error
 * (404 / 403 / 409). Used by the documents and supporting-files routes (ADR 0037).
 */
async function editableEnvelope(c: Context<AppEnv>) {
  const scope = forOrganization(c.get("organizationId"))
  const envelope = await prisma.envelope.findFirst({
    where: scope.envelope({ id: c.req.param("id") }),
    select: {
      id: true,
      status: true,
      createdById: true,
      documents: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          documentId: true,
          document: { select: { name: true, sha256: true, pageCount: true } },
        },
      },
    },
  })
  if (!envelope) notFound("Envelope")
  const e = envelope as NonNullable<typeof envelope>
  assertCanManageEnvelope(c, e)
  if (!isEditable(e.status)) conflict("Only draft envelopes can be edited")
  return e
}

const documentsOf = async (envelopeId: string) =>
  (
    await prisma.envelopeDocument.findMany({
      where: { envelopeId },
      ...envelopeDocumentsSelect,
    })
  ).map(documentView)

export const envelopes = new Hono<AppEnv>()
  .use(requireOrg)

  .post("/", async (c) => {
    const input = await parseJson(c, CreateEnvelopeSchema)
    const orgId = c.get("organizationId")
    const documents = await loadReadyDocuments(orgId, input.documentIds)
    if (input.folderId) await assertFolderInOrg(orgId, input.folderId)

    const envelope = await prisma.$transaction(async (tx) => {
      const created = await tx.envelope.create({
        data: {
          organizationId: orgId,
          createdById: c.get("user").id,
          title: input.title,
          message: input.message,
          signingOrder: input.signingOrder,
          expiresAt: input.expiresAt,
          folderId: input.folderId ?? null,
        },
      })
      await attachDocuments(tx, created.id, documents)
      await appendAuditEvent(tx, {
        envelopeId: created.id,
        type: "envelope.created",
        actorUserId: c.get("user").id,
        data: { documents: documentsAuditData(documents) },
        ...clientMeta(c),
      })
      return created
    })
    return c.json({ envelope }, 201)
  })

  /**
   * The Envelopes list (ADR 0036), newest first, 25 a page: one folder (root when `folderId` is
   * omitted, ADR 0038). `q` matches the title, a tag, the document's name or a recipient's name or
   * email; `q`, `tag` and `color` search every folder. `stage` (Status chip), `senderId` (creator)
   * and `period` narrow either view. Each item carries its document's first-page thumbnail (ADR 0033) and whether the
   * caller may manage it.
   */
  .get("/", async (c) => {
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const query = parseQuery(c, ListEnvelopesQuerySchema)
    const pageSize = ENVELOPES_PAGE_SIZE
    if (query.folderId) await assertFolderInOrg(orgId, query.folderId)
    const filters = envelopeWhere({ ...query, ownerId: query.senderId })
    const where = scope.envelope(filters)
    const [rows, total, senders] = await prisma.$transaction([
      prisma.envelope.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
        include: envelopeListInclude,
      }),
      prisma.envelope.count({ where }),
      // "Sent by" chip options: everyone who created an envelope in this workspace.
      prisma.user.findMany({
        where: { envelopes: { some: scope.envelope() } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ])
    const me = actor(c)
    const items = await Promise.all(rows.map((e) => envelopeListItem(e, me)))
    return c.json({
      items,
      page: query.page,
      pageSize,
      total,
      senders,
      // Tags and Color chip options and the tag picker's suggestions (ADR 0038).
      tags: await tagsInUse(orgId),
      colors: await colorsInUse(orgId),
    })
  })

  .get("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: {
        documents: envelopeDocumentsSelect,
        attachments: envelopeAttachmentsSelect,
        recipients: { select: recipientSelect, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        fields: { orderBy: [{ page: "asc" }, { y: "asc" }] },
        certificate: { select: { code: true, issuedAt: true, provider: true } },
      },
    })
    if (!envelope) notFound("Envelope")
    const { documents, attachments, bundleS3Key: _bundle, ...rest } = envelope
    return c.json({
      envelope: {
        ...rest,
        documents: documents.map(documentView),
        attachments: attachments.map(attachmentView),
      },
      permissions: {
        manage: canManageEnvelope(actor(c), envelope),
        // Delete files + personal data now (docs/data-retention.md)
        purge:
          hasPermission(c.get("memberRole"), { data: ["manage"] }) &&
          isClosed(envelope.status) &&
          !envelope.purgedAt,
      },
    })
  })

  /**
   * Move to a folder (`folderId: null` = root) and/or set the colour and tags (ADR 0038). Any
   * status: folders and labels are organisation only, so this is not a state change and writes no
   * audit event. Same rule as managing the envelope (sender, admin, owner).
   */
  .patch("/:id/labels", async (c) => {
    const input = await parseJson(c, UpdateEnvelopeLabelsSchema)
    const orgId = c.get("organizationId")
    const envelope = await prisma.envelope.findFirst({
      where: forOrganization(orgId).envelope({ id: c.req.param("id") }),
      select: { id: true, createdById: true },
    })
    if (!envelope) notFound("Envelope")
    assertCanManageEnvelope(c, envelope)
    if (input.folderId) await assertFolderInOrg(orgId, input.folderId)
    const tags = input.tags && (await resolveTags(orgId, input.tags))
    const updated = await prisma.envelope.update({
      where: { id: envelope.id },
      data: {
        ...(input.folderId !== undefined && { folderId: input.folderId }),
        ...(input.color !== undefined && { color: input.color }),
        ...(tags && { tags: { set: tags } }),
      },
      select: { id: true, folderId: true, color: true, tags: TAG_SELECT },
    })
    return c.json({ envelope: updated })
  })

  /**
   * Title, message, signing order and expiry of a draft (the draft editor's "Review & send").
   * Turning on "sign in order" numbers the recipients by their list position; turning it off puts
   * everyone on step 1, as `PUT …/recipients` stores parallel envelopes.
   */
  .put("/:id/details", async (c) => {
    const details = await parseJson(c, UpdateEnvelopeDetailsSchema)
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      select: { id: true, createdById: true, status: true, signingOrder: true },
    })
    if (!envelope) notFound("Envelope")
    assertCanManageEnvelope(c, envelope)
    if (!isEditable(envelope.status)) conflict("Only draft envelopes can be edited")
    if (details.expiresAt && details.expiresAt <= new Date()) {
      throw new EnvelopeError(400, "validation_error", "Pick a date in the future", {
        issues: [{ path: "expiresAt", message: "Pick a date in the future" }],
      })
    }

    const saved = await prisma.$transaction(async (tx) => {
      const updated = await tx.envelope.update({
        where: { id: envelope.id },
        data: {
          title: details.title,
          message: details.message?.trim() || null,
          signingOrder: details.signingOrder,
          expiresAt: details.expiresAt,
        },
        select: { id: true, title: true, message: true, signingOrder: true, expiresAt: true },
      })
      if (details.signingOrder !== envelope.signingOrder) {
        const recipients = await tx.recipient.findMany({
          where: { envelopeId: envelope.id },
          orderBy: [{ colorIndex: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        })
        for (const [i, r] of recipients.entries()) {
          await tx.recipient.update({
            where: { id: r.id },
            data: { order: details.signingOrder === "SEQUENTIAL" ? i + 1 : 1 },
          })
        }
      }
      return updated
    })
    return c.json({ envelope: saved })
  })

  /**
   * Switch one of a draft's documents to another READY document of the workspace (the draft
   * editor's "Prepare document" saves a new one, then calls this). That document's fields are
   * removed; audited (ADR 0024, 0037).
   */
  .put("/:id/document", async (c) => {
    const { documentId, envelopeDocumentId } = await parseJson(c, ReplaceEnvelopeDocumentSchema)
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      select: { id: true, createdById: true },
    })
    if (!envelope) notFound("Envelope")
    assertCanManageEnvelope(c, envelope)
    const result = await replaceEnvelopeDocument({
      envelopeId: envelope.id,
      organizationId: c.get("organizationId"),
      documentId,
      envelopeDocumentId,
      actor: { userId: c.get("user").id, ...clientMeta(c) },
    })
    return c.json(result)
  })

  /** Add READY library documents to a draft, after its current ones (ADR 0037). Audited. */
  .post("/:id/documents", async (c) => {
    const { documentIds } = await parseJson(c, AddEnvelopeDocumentsSchema)
    const envelope = await editableEnvelope(c)
    if (envelope.documents.some((d) => documentIds.includes(d.documentId))) {
      conflict("That document is already in this envelope")
    }
    const documents = await loadReadyDocuments(c.get("organizationId"), documentIds, {
      documents: envelope.documents.length,
      pages: totalPages(envelope.documents),
    })
    await prisma.$transaction(async (tx) => {
      const start = (envelope.documents.at(-1)?.order ?? -1) + 1
      const ids = await attachDocuments(tx, envelope.id, documents, start)
      await appendAuditEvent(tx, {
        envelopeId: envelope.id,
        type: "envelope.document_added",
        actorUserId: c.get("user").id,
        data: {
          documents: documentsAuditData(documents).map((d, i) => ({
            ...d,
            envelopeDocumentId: ids[i],
          })),
        },
        ...clientMeta(c),
      })
    })
    return c.json({ documents: await documentsOf(envelope.id) }, 201)
  })

  /** Remove a document (and its fields) from a draft. The last document can't go. Audited. */
  .delete("/:id/documents/:envelopeDocumentId", async (c) => {
    const envelope = await editableEnvelope(c)
    const target = envelope.documents.find((d) => d.id === c.req.param("envelopeDocumentId"))
    if (!target) notFound("Envelope document")
    const doc = target as NonNullable<typeof target>
    if (envelope.documents.length === 1) conflict("An envelope needs at least one document")
    if (await prisma.field.count({ where: { envelopeDocumentId: doc.id, locked: true } })) {
      lockedFields(
        "This document was drafted with AI and its fields sit on the lines it prints. Start a new version of it in the AI draft instead.",
      )
    }
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.field.deleteMany({ where: { envelopeDocumentId: doc.id } })
      await tx.envelopeDocument.delete({ where: { id: doc.id } })
      // Close the gap so orders stay 0..n-1.
      const rest = envelope.documents.filter((d) => d.id !== doc.id)
      for (const [i, d] of rest.entries()) {
        if (d.order !== i)
          await tx.envelopeDocument.update({ where: { id: d.id }, data: { order: i } })
      }
      await appendAuditEvent(tx, {
        envelopeId: envelope.id,
        type: "envelope.document_removed",
        actorUserId: c.get("user").id,
        data: {
          envelopeDocumentId: doc.id,
          documentId: doc.documentId,
          name: doc.document.name,
          sha256: doc.document.sha256,
          fieldsRemoved: count,
        },
        ...clientMeta(c),
      })
    })
    return c.json({ documents: await documentsOf(envelope.id) })
  })

  /** Reorder a draft's documents: every envelope document id once, in the new order. Audited. */
  .put("/:id/documents/order", async (c) => {
    const { envelopeDocumentIds } = await parseJson(c, ReorderEnvelopeDocumentsSchema)
    const envelope = await editableEnvelope(c)
    const current = new Set(envelope.documents.map((d) => d.id))
    if (
      envelopeDocumentIds.length !== current.size ||
      envelopeDocumentIds.some((id) => !current.has(id))
    ) {
      badRequest("List every document of the envelope once")
    }
    await prisma.$transaction(async (tx) => {
      for (const [i, id] of envelopeDocumentIds.entries()) {
        await tx.envelopeDocument.update({ where: { id }, data: { order: i } })
      }
      await appendAuditEvent(tx, {
        envelopeId: envelope.id,
        type: "envelope.documents_reordered",
        actorUserId: c.get("user").id,
        data: { envelopeDocumentIds },
        ...clientMeta(c),
      })
    })
    return c.json({ documents: await documentsOf(envelope.id) })
  })

  /**
   * Start a supporting file's upload (ADR 0037): an allowed type, ≤ 25 MB, at most
   * MAX_ATTACHMENTS per envelope. Returns a presigned PUT; `complete` checks and hashes it.
   */
  .post("/:id/attachments/uploads", async (c) => {
    const input = await parseJson(c, CreateAttachmentUploadSchema)
    const envelope = await editableEnvelope(c)
    const count = await prisma.envelopeAttachment.count({
      where: { envelopeId: envelope.id, status: { not: "FAILED" } },
    })
    if (count >= MAX_ATTACHMENTS) badRequest(`An envelope can hold up to ${MAX_ATTACHMENTS} files`)
    const id = crypto.randomUUID()
    const s3Key = keys.attachment(c.get("organizationId"), envelope.id, id)
    const attachment = await prisma.envelopeAttachment.create({
      data: {
        id,
        envelopeId: envelope.id,
        name: input.name,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        s3Key,
        order: count,
        uploadedById: c.get("user").id,
      },
      select: envelopeAttachmentsSelect.select,
    })
    const uploadUrl = await presignUpload(s3Key, input.contentType, input.sizeBytes)
    return c.json({ attachment: attachmentView(attachment), uploadUrl }, 201)
  })

  /** Confirm an uploaded supporting file: it must exist, match its size, and be hashed. Audited. */
  .post("/:id/attachments/:attachmentId/complete", async (c) => {
    const envelope = await editableEnvelope(c)
    const row = await prisma.envelopeAttachment.findFirst({
      where: { id: c.req.param("attachmentId"), envelopeId: envelope.id },
    })
    if (!row) notFound("File")
    const a = row as NonNullable<typeof row>
    if (a.status !== "UPLOADING") conflict(`File is already ${a.status}`)
    const head = await headObject(a.s3Key)
    if (!head || head.sizeBytes !== a.sizeBytes || head.sizeBytes > MAX_UPLOAD_BYTES) {
      await prisma.envelopeAttachment.update({ where: { id: a.id }, data: { status: "FAILED" } })
      await deleteObject(a.s3Key).catch(() => {})
      badRequest("Upload not found in storage, or it doesn't match the announced size")
    }
    const sha256 = await sha256Hex(await getObjectBytes(a.s3Key))
    const saved = await prisma.$transaction(async (tx) => {
      const updated = await tx.envelopeAttachment.update({
        where: { id: a.id },
        data: { status: "READY", sha256 },
        select: envelopeAttachmentsSelect.select,
      })
      await appendAuditEvent(tx, {
        envelopeId: envelope.id,
        type: "envelope.attachment_added",
        actorUserId: c.get("user").id,
        data: { attachmentId: a.id, name: a.name, contentType: a.contentType, sha256 },
        ...clientMeta(c),
      })
      return updated
    })
    return c.json({ attachment: attachmentView(saved) })
  })

  /** Remove a supporting file from a draft (and its object). Audited when it was ready. */
  .delete("/:id/attachments/:attachmentId", async (c) => {
    const envelope = await editableEnvelope(c)
    const row = await prisma.envelopeAttachment.findFirst({
      where: { id: c.req.param("attachmentId"), envelopeId: envelope.id },
    })
    if (!row) notFound("File")
    const a = row as NonNullable<typeof row>
    await prisma.$transaction(async (tx) => {
      await tx.envelopeAttachment.delete({ where: { id: a.id } })
      if (a.status === "READY") {
        await appendAuditEvent(tx, {
          envelopeId: envelope.id,
          type: "envelope.attachment_removed",
          actorUserId: c.get("user").id,
          data: { attachmentId: a.id, name: a.name, sha256: a.sha256 },
          ...clientMeta(c),
        })
      }
    })
    await deleteObject(a.s3Key).catch(() => {})
    return c.body(null, 204)
  })

  /** A supporting file for members of the workspace: always a download, never inline. */
  .get("/:id/attachments/:attachmentId/file", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const row = await prisma.envelopeAttachment.findFirst({
      where: {
        id: c.req.param("attachmentId"),
        status: "READY",
        envelope: scope.envelope({ id: c.req.param("id") }),
      },
      select: { name: true, s3Key: true, envelope: { select: { purgedAt: true } } },
    })
    if (!row) notFound("File")
    const a = row as NonNullable<typeof row>
    if (a.envelope.purgedAt) gone()
    return c.json({
      url: await presignDownload(a.s3Key, { fileName: a.name, disposition: "attachment" }),
    })
  })

  /** Replace the recipient list (draft only). Removed recipients lose their fields. */
  .put("/:id/recipients", async (c) => {
    const { recipients } = await parseJson(c, ReplaceRecipientsSchema)
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: { recipients: { select: { id: true } } },
    })
    if (!envelope) notFound("Envelope")
    assertCanManageEnvelope(c, envelope)
    if (!isEditable(envelope.status)) conflict("Only draft envelopes can be edited")

    const emails = recipients.map((r) => r.email)
    if (new Set(emails).size !== emails.length) badRequest("Duplicate recipient emails")
    const existingIds = new Set(envelope.recipients.map((r) => r.id))
    // Signers of an AI-drafted document keep their place: their fields sit on printed lines.
    const lockedOwners = await prisma.field.findMany({
      where: { envelopeId: envelope.id, locked: true },
      select: { recipientId: true },
      distinct: ["recipientId"],
    })
    for (const { recipientId } of lockedOwners) {
      const next = recipients.find((r) => r.id === recipientId)
      if (!next || next.role === "VIEWER") {
        lockedFields(
          "A signer of the AI-drafted document can't be removed or made a viewer here. Change the signers in the AI draft and start a new version.",
        )
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      const keep = recipients
        .filter((r) => r.id && existingIds.has(r.id))
        .map((r) => r.id as string)
      await tx.recipient.deleteMany({ where: { envelopeId: envelope.id, id: { notIn: keep } } })
      for (const [i, r] of recipients.entries()) {
        const data = {
          name: r.name,
          email: r.email,
          phone: r.phone ?? null,
          role: r.role,
          order: envelope.signingOrder === "SEQUENTIAL" ? r.order : 1,
          verification: r.verification,
          delivery: r.delivery,
          colorIndex: i,
        }
        if (r.id && existingIds.has(r.id)) await tx.recipient.update({ where: { id: r.id }, data })
        else await tx.recipient.create({ data: { ...data, envelopeId: envelope.id } })
      }
      // Viewers never own fields
      await tx.field.deleteMany({
        where: { envelopeId: envelope.id, recipient: { role: "VIEWER" } },
      })
      return tx.recipient.findMany({ where: { envelopeId: envelope.id }, select: recipientSelect })
    })
    return c.json({ recipients: saved })
  })

  /** Replace all fields (editor autosave) except locked ones, which stay. Draft only. */
  .put("/:id/fields", async (c) => {
    const { fields } = await parseJson(c, ReplaceFieldsSchema)
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: {
        recipients: { select: { id: true, role: true } },
        documents: { select: { id: true, order: true, document: { select: { pageCount: true } } } },
      },
    })
    if (!envelope) notFound("Envelope")
    assertCanManageEnvelope(c, envelope)
    if (!isEditable(envelope.status)) conflict("Only draft envelopes can be edited")

    const owners = new Map(envelope.recipients.map((r) => [r.id, r.role]))
    const firstDocument = [...envelope.documents].sort((a, b) => a.order - b.order)[0]?.id
    const placed = fields.map((f) => ({
      ...f,
      envelopeDocumentId: f.envelopeDocumentId ?? firstDocument,
    }))
    const pagesOf = new Map(envelope.documents.map((d) => [d.id, d.document.pageCount ?? 0]))
    for (const f of placed) {
      const role = owners.get(f.recipientId)
      if (!role) badRequest(`Unknown recipient ${f.recipientId}`)
      if (role === "VIEWER") badRequest("Viewers cannot own fields")
      const pages = f.envelopeDocumentId ? pagesOf.get(f.envelopeDocumentId) : undefined
      if (pages === undefined) badRequest("Field is on a document that isn't in this envelope")
      if (f.page > (pages ?? 0)) badRequest(`Page ${f.page} does not exist`)
    }

    // Locked fields (finalised AI documents) aren't part of the payload and stay as they are; one
    // sent back unchanged, e.g. by an older tab, is not added twice.
    const locked = await prisma.field.findMany({
      where: { envelopeId: envelope.id, locked: true },
    })
    const isLocked = (f: (typeof placed)[number]) =>
      locked.some(
        (l) =>
          l.recipientId === f.recipientId &&
          l.envelopeDocumentId === f.envelopeDocumentId &&
          l.type === f.type &&
          l.page === f.page &&
          Math.abs(l.x - f.x) < 1e-6 &&
          Math.abs(l.y - f.y) < 1e-6 &&
          Math.abs(l.width - f.width) < 1e-6 &&
          Math.abs(l.height - f.height) < 1e-6,
      )
    const unlocked = placed.filter((f) => !isLocked(f))

    const saved = await prisma.$transaction(async (tx) => {
      await tx.field.deleteMany({ where: { envelopeId: envelope.id, locked: false } })
      await tx.field.createMany({
        data: unlocked.map(({ id: _id, ...f }) => ({
          ...f,
          envelopeDocumentId: f.envelopeDocumentId as string,
          envelopeId: envelope.id,
        })),
      })
      return tx.field.findMany({ where: { envelopeId: envelope.id } })
    })
    return c.json({ fields: saved })
  })

  /** Everything that would stop `send` right now (all issues, not just the first). */
  .get("/:id/preflight", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: { recipients: true, fields: { select: { recipientId: true, type: true } } },
    })
    if (!envelope) notFound("Envelope")
    return c.json({ status: envelope.status, issues: sendPreflight(envelope) })
  })

  .post("/:id/send", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      select: { id: true, createdById: true },
    })
    if (!envelope) notFound("Envelope")
    assertCanManageEnvelope(c, envelope)
    const { notified } = await sendEnvelope({
      envelopeId: envelope.id,
      organizationId: c.get("organizationId"),
      actor: { userId: c.get("user").id, ...clientMeta(c) },
    })
    return c.json({ ok: true, notified })
  })

  .post("/:id/void", async (c) => {
    const { reason } = await parseJson(c, VoidEnvelopeSchema)
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      select: { id: true, createdById: true },
    })
    if (!envelope) notFound("Envelope")
    assertCanManageEnvelope(c, envelope)
    await voidEnvelope({
      envelopeId: envelope.id,
      organizationId: c.get("organizationId"),
      reason,
      actor: { userId: c.get("user").id, ...clientMeta(c) },
    })
    return c.json({ ok: true })
  })

  .post("/:id/recipients/:recipientId/remind", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const recipient = await prisma.recipient.findFirst({
      where: {
        id: c.req.param("recipientId"),
        envelope: scope.envelope({ id: c.req.param("id") }),
      },
      include: { envelope: { select: { status: true, createdById: true } } },
    })
    if (!recipient) notFound("Recipient")
    assertCanManageEnvelope(c, recipient.envelope)
    if (recipient.delivery === "EMBEDDED") {
      conflict("Embedded recipients sign inside your app and aren't emailed")
    }
    // Same rules the UI uses to enable "Send reminder" (throttled: it emails and rotates the link).
    const availability = reminderAvailability(recipient, recipient.envelope.status)
    if (!availability.ok) {
      if (availability.reason === "cooldown") {
        c.header("Retry-After", String(availability.waitSec))
        return c.json(
          {
            error: "reminder_cooldown",
            message: "A reminder was sent recently",
            retryAfterSec: availability.waitSec,
          },
          429,
        )
      }
      return c.json(
        { error: availability.reason, message: "This recipient can't be reminded" },
        409,
      )
    }

    const link = await prisma.$transaction(async (tx) => {
      const l = await rotateRecipientLink(tx, recipient.id)
      await appendAuditEvent(tx, {
        envelopeId: recipient.envelopeId,
        type: "recipient.reminded",
        recipientId: recipient.id,
        actorUserId: c.get("user").id,
        ...clientMeta(c),
      })
      return l
    })
    await getQueues().notifications.add("envelope.reminder", link)
    return c.json({ ok: true })
  })

  .get("/:id/audit", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: { auditEvents: { orderBy: { seq: "asc" } } },
    })
    if (!envelope) notFound("Envelope")
    const verification = await verifyAuditChain(envelope.auditEvents.map(toChainedEvent))
    return c.json({ events: envelope.auditEvents, verification })
  })

  .get("/:id/downloads", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: {
        certificate: true,
        documents: envelopeDocumentsSelect,
        attachments: { ...envelopeAttachmentsSelect, where: { status: "READY" } },
      },
    })
    if (!envelope) notFound("Envelope")
    if (envelope.purgedAt) gone()
    return c.json(await downloadLinks(envelope))
  })

  /**
   * Delete this closed envelope's files and personal data now, keeping the evidence
   * (docs/data-retention.md). Owners/admins; e.g. for a data-subject erasure request.
   */
  .post("/:id/purge", async (c) => {
    if (!hasPermission(c.get("memberRole"), { data: ["manage"] })) {
      forbidden("Only owners and admins can delete envelope data")
    }
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      select: { id: true, status: true, purgedAt: true },
    })
    if (!envelope) notFound("Envelope")
    if (envelope.purgedAt) conflict("This envelope's data was already deleted")
    if (!isClosed(envelope.status)) {
      conflict("Only completed, declined, voided or expired envelopes can be deleted")
    }
    await getQueues().maintenance.add(
      "envelope.purge",
      { envelopeId: envelope.id, reason: "manual" },
      { jobId: `purge-${envelope.id}` },
    )
    return c.json({ ok: true }, 202)
  })
