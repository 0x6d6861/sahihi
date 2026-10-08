import {
  canManageTemplate,
  ListTemplatesQuerySchema,
  SaveTemplateSchema,
  TEMPLATES_PAGE_SIZE,
  templateRolesFromEnvelope,
  UpdateTemplateSchema,
  UseTemplateRequestSchema,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { createEnvelopeFromTemplate } from "@sahihi/envelopes"
import { copyObject, deleteObject, keys } from "@sahihi/infra"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { assertFolderInOrg } from "../lib/folder-tree"
import { badRequest, clientMeta, notFound, parseJson, parseQuery } from "../lib/http"
import { colorsInUse, resolveTags, TAG_SELECT, tagsInUse } from "../lib/labels"
import { templateWhere } from "../lib/list-filters"
import { templateListInclude, templateListItem } from "../lib/list-items"
import { actor, assertCanManageTemplate } from "../lib/permissions"
import { sendAfterCreate } from "../lib/send-after-create"
import { requireOrg } from "../middleware/session"

/**
 * Templates (docs/templates.md): a document + recipient roles + a field layout.
 * Saved from an envelope, used to create DRAFT envelopes. Everyone in the org can see and use
 * them; renaming and deleting follows the `template` permission (creator, admin, owner).
 */

const roleSelect = {
  id: true,
  label: true,
  role: true,
  order: true,
  verification: true,
  colorIndex: true,
  name: true,
  email: true,
  phone: true,
} as const

const fieldSelect = {
  id: true,
  roleId: true,
  templateDocumentId: true,
  type: true,
  page: true,
  x: true,
  y: true,
  width: true,
  height: true,
  required: true,
  label: true,
} as const

export const templates = new Hono<AppEnv>()
  .use(requireOrg)

  /** Save an envelope (any status) as a template. The envelope itself is not touched. */
  .post("/", async (c) => {
    const input = await parseJson(c, SaveTemplateSchema)
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: input.envelopeId }),
      include: {
        documents: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            documentId: true,
            document: { select: { status: true, deletedAt: true } },
          },
        },
        attachments: { where: { status: "READY" }, orderBy: { order: "asc" } },
        recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        fields: true,
      },
    })
    if (!envelope) notFound("Envelope")
    if (input.folderId) await assertFolderInOrg(orgId, input.folderId)
    if (envelope.documents.some((d) => d.document.status !== "READY" || d.document.deletedAt)) {
      badRequest("A document of this envelope is no longer available")
    }
    const built = templateRolesFromEnvelope(envelope.recipients, input.roles)
    if (!built.ok) badRequest(built.message)

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.template.create({
        data: {
          organizationId: orgId,
          createdById: c.get("user").id,
          name: input.name,
          description: input.description || null,
          message: envelope.message,
          signingOrder: envelope.signingOrder,
          folderId: input.folderId ?? null,
        },
      })
      // The documents in order; fields are re-pointed at the template's own document rows.
      const templateDocumentByEnvelopeDocument = new Map<string, string>()
      for (const [i, d] of envelope.documents.entries()) {
        const row = await tx.templateDocument.create({
          data: { templateId: created.id, documentId: d.documentId, order: i },
          select: { id: true },
        })
        templateDocumentByEnvelopeDocument.set(d.id, row.id)
      }
      // Supporting files: the template keeps its own copies, so it outlives the envelope's
      // retention (ADR 0037).
      for (const [i, a] of envelope.attachments.entries()) {
        const id = crypto.randomUUID()
        const key = keys.templateAttachment(orgId, created.id, id)
        await copyObject(a.s3Key, key)
        await tx.templateAttachment.create({
          data: {
            id,
            templateId: created.id,
            name: a.name,
            contentType: a.contentType,
            sizeBytes: a.sizeBytes,
            sha256: a.sha256 ?? "",
            s3Key: key,
            order: i,
          },
        })
      }
      const roleIdByRecipient = new Map<string, string>()
      for (const { recipientId, ...role } of built.roles) {
        const saved = await tx.templateRole.create({ data: { ...role, templateId: created.id } })
        roleIdByRecipient.set(recipientId, saved.id)
      }
      await tx.templateField.createMany({
        data: envelope.fields.map((f) => ({
          templateId: created.id,
          templateDocumentId: templateDocumentByEnvelopeDocument.get(
            f.envelopeDocumentId,
          ) as string,
          roleId: roleIdByRecipient.get(f.recipientId) as string,
          type: f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.required,
          label: f.label,
        })),
      })
      return created
    })
    return c.json({ template }, 201)
  })

  /**
   * The Templates list (ADR 0036), newest first, 25 a page: one folder (root when `folderId` is
   * omitted, ADR 0038). `q` matches the name, the description, a tag or the document's name; `q`,
   * `tag` and `color` search every folder. `createdById` (Saved by chip) and `period` narrow either
   * view. Each item carries
   * its document's first-page thumbnail (ADR 0033).
   */
  .get("/", async (c) => {
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const query = parseQuery(c, ListTemplatesQuerySchema)
    const pageSize = TEMPLATES_PAGE_SIZE
    if (query.folderId) await assertFolderInOrg(orgId, query.folderId)
    const filters = templateWhere({ ...query, ownerId: query.createdById })
    const where = scope.template(filters)
    const [rows, total, savers] = await prisma.$transaction([
      prisma.template.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
        include: templateListInclude,
      }),
      prisma.template.count({ where }),
      // "Saved by" chip options: everyone who saved a template in this workspace.
      prisma.user.findMany({
        where: { templates: { some: scope.template() } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ])
    const a = actor(c)
    return c.json({
      items: await Promise.all(rows.map((t) => templateListItem(t, a))),
      page: query.page,
      pageSize,
      total,
      savers,
      // Tags and Color chip options and the tag picker's suggestions (ADR 0038).
      tags: await tagsInUse(orgId),
      colors: await colorsInUse(orgId),
    })
  })

  .get("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const template = await prisma.template.findFirst({
      where: scope.template({ id: c.req.param("id") }),
      include: {
        documents: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            documentId: true,
            order: true,
            document: { select: { name: true, pageCount: true, pages: true } },
          },
        },
        attachments: {
          orderBy: { order: "asc" },
          select: { id: true, name: true, contentType: true, sizeBytes: true },
        },
        roles: { select: roleSelect, orderBy: { order: "asc" } },
        fields: { select: fieldSelect, orderBy: [{ page: "asc" }, { y: "asc" }] },
      },
    })
    if (!template) notFound("Template")
    const { documents, ...rest } = template
    return c.json({
      template: {
        ...rest,
        // `id` is the template document (what fields' `templateDocumentId` points at).
        documents: documents.map((d) => ({
          id: d.id,
          documentId: d.documentId,
          order: d.order,
          name: d.document.name,
          pageCount: d.document.pageCount,
          pages: d.document.pages,
        })),
      },
      permissions: { manage: canManageTemplate(actor(c), template) },
    })
  })

  .patch("/:id", async (c) => {
    const input = await parseJson(c, UpdateTemplateSchema)
    const orgId = c.get("organizationId")
    const template = await prisma.template.findFirst({
      where: forOrganization(orgId).template({ id: c.req.param("id") }),
    })
    if (!template) notFound("Template")
    assertCanManageTemplate(c, template)
    if (input.folderId) await assertFolderInOrg(orgId, input.folderId)
    const tags = input.tags && (await resolveTags(orgId, input.tags))
    const updated = await prisma.template.update({
      where: { id: template.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description || null }),
        // Folder and labels (ADR 0038): organisation only.
        ...(input.folderId !== undefined && { folderId: input.folderId }),
        ...(input.color !== undefined && { color: input.color }),
        ...(tags && { tags: { set: tags } }),
      },
      include: { tags: TAG_SELECT },
    })
    return c.json({ template: updated })
  })

  .delete("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const template = await prisma.template.findFirst({
      where: scope.template({ id: c.req.param("id") }),
      include: { attachments: { select: { s3Key: true } } },
    })
    if (!template) notFound("Template")
    assertCanManageTemplate(c, template)
    // Envelopes created from it are independent copies; only the template and its own copies of
    // supporting files go.
    await prisma.template.delete({ where: { id: template.id } })
    for (const a of template.attachments) await deleteObject(a.s3Key).catch(() => {})
    return c.body(null, 204)
  })

  /**
   * Use the template: fill every role, get a DRAFT envelope with the fields copied. `send: true`
   * ("Send now") sends it too; a refused send still answers 201 with `sent: false`.
   */
  .post("/:id/envelopes", async (c) => {
    const { send, ...data } = await parseJson(c, UseTemplateRequestSchema)
    const organizationId = c.get("organizationId")
    const by = { userId: c.get("user").id, ...clientMeta(c) }
    const envelope = await createEnvelopeFromTemplate({
      templateId: c.req.param("id"),
      organizationId,
      actor: by,
      data,
    })
    if (!send) return c.json({ envelope, sent: false }, 201)
    const result = await sendAfterCreate({ envelopeId: envelope.id, organizationId, actor: by })
    return c.json({ ...result, envelope }, 201)
  })
