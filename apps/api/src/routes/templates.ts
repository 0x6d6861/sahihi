import {
  canManageTemplate,
  SaveTemplateSchema,
  templateRolesFromEnvelope,
  UpdateTemplateSchema,
  UseTemplateSchema,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { createEnvelopeFromTemplate } from "@sahihi/envelopes"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { badRequest, clientMeta, notFound, parseJson } from "../lib/http"
import { actor, assertCanManageTemplate } from "../lib/permissions"
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
        document: { select: { id: true, status: true, deletedAt: true } },
        recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        fields: true,
      },
    })
    if (!envelope) notFound("Envelope")
    if (envelope.document.status !== "READY" || envelope.document.deletedAt) {
      badRequest("This envelope's document is no longer available")
    }
    const built = templateRolesFromEnvelope(envelope.recipients, input.roles)
    if (!built.ok) badRequest(built.message)

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.template.create({
        data: {
          organizationId: orgId,
          documentId: envelope.documentId,
          createdById: c.get("user").id,
          name: input.name,
          description: input.description || null,
          message: envelope.message,
          signingOrder: envelope.signingOrder,
        },
      })
      const roleIdByRecipient = new Map<string, string>()
      for (const { recipientId, ...role } of built.roles) {
        const saved = await tx.templateRole.create({ data: { ...role, templateId: created.id } })
        roleIdByRecipient.set(recipientId, saved.id)
      }
      await tx.templateField.createMany({
        data: envelope.fields.map((f) => ({
          templateId: created.id,
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

  .get("/", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const rows = await prisma.template.findMany({
      where: scope.template(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      include: {
        document: { select: { id: true, name: true, pageCount: true } },
        createdBy: { select: { name: true } },
        roles: { select: { label: true, role: true }, orderBy: { order: "asc" } },
        _count: { select: { fields: true } },
      },
    })
    const a = actor(c)
    return c.json({
      items: rows.map(({ createdById, ...t }) => ({
        ...t,
        permissions: { manage: canManageTemplate(a, { createdById }) },
      })),
    })
  })

  .get("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const template = await prisma.template.findFirst({
      where: scope.template({ id: c.req.param("id") }),
      include: {
        document: { select: { id: true, name: true, pageCount: true, pages: true } },
        roles: { select: roleSelect, orderBy: { order: "asc" } },
        fields: { select: fieldSelect, orderBy: [{ page: "asc" }, { y: "asc" }] },
      },
    })
    if (!template) notFound("Template")
    return c.json({
      template,
      permissions: { manage: canManageTemplate(actor(c), template) },
    })
  })

  .patch("/:id", async (c) => {
    const input = await parseJson(c, UpdateTemplateSchema)
    const scope = forOrganization(c.get("organizationId"))
    const template = await prisma.template.findFirst({
      where: scope.template({ id: c.req.param("id") }),
    })
    if (!template) notFound("Template")
    assertCanManageTemplate(c, template)
    const updated = await prisma.template.update({
      where: { id: template.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description || null }),
      },
    })
    return c.json({ template: updated })
  })

  .delete("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const template = await prisma.template.findFirst({
      where: scope.template({ id: c.req.param("id") }),
    })
    if (!template) notFound("Template")
    assertCanManageTemplate(c, template)
    // Envelopes created from it are independent copies; only the template goes.
    await prisma.template.delete({ where: { id: template.id } })
    return c.body(null, 204)
  })

  /** Use the template: fill every role, get a DRAFT envelope with the fields copied. */
  .post("/:id/envelopes", async (c) => {
    const data = await parseJson(c, UseTemplateSchema)
    const envelope = await createEnvelopeFromTemplate({
      templateId: c.req.param("id"),
      organizationId: c.get("organizationId"),
      actor: { userId: c.get("user").id, ...clientMeta(c) },
      data,
    })
    return c.json({ envelope }, 201)
  })
