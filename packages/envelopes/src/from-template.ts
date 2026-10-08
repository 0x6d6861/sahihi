import { draftFromTemplate, type UseTemplateInput } from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { copyObject, keys } from "@sahihi/infra"
import { attachDocuments } from "./documents"
import { EnvelopeError, notFound } from "./errors"
import { type Actor, actorData } from "./send"

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

/**
 * Template → DRAFT envelope with people filled in and fields copied (docs/templates.md).
 * Used by "Use template", the public API and bulk send. Throws EnvelopeError with per-role
 * `issues` when people are missing or invalid.
 */
export async function createEnvelopeFromTemplate(input: {
  templateId: string
  organizationId: string
  actor: Actor
  data: UseTemplateInput
  /** Extra audit data, e.g. `{ bulkSendId }` */
  auditExtra?: Record<string, unknown>
}) {
  const template = await prisma.template.findFirst({
    where: { id: input.templateId, organizationId: input.organizationId },
    include: {
      documents: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          document: {
            select: { id: true, name: true, status: true, deletedAt: true, sha256: true },
          },
        },
      },
      attachments: { orderBy: { order: "asc" } },
      roles: { select: roleSelect, orderBy: { order: "asc" } },
      fields: { select: fieldSelect },
    },
  })
  if (!template) notFound("Template")
  const t = template as NonNullable<typeof template>
  if (t.documents.some((d) => d.document.status !== "READY" || d.document.deletedAt)) {
    throw new EnvelopeError(
      400,
      "document_unavailable",
      "A document of this template is no longer available",
    )
  }
  if (input.data.expiresAt && input.data.expiresAt <= new Date()) {
    throw new EnvelopeError(400, "validation_error", "Pick a date in the future", {
      issues: [{ path: "expiresAt", message: "Pick a date in the future" }],
    })
  }
  const draft = draftFromTemplate(t, input.data.recipients)
  if (!draft.ok) {
    throw new EnvelopeError(
      400,
      "validation_error",
      draft.issues[0]?.message ?? "Invalid recipients",
      {
        issues: draft.issues,
      },
    )
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.envelope.create({
      data: {
        organizationId: input.organizationId,
        createdById: input.actor.userId,
        title: input.data.title,
        message: input.data.message ?? t.message,
        signingOrder: t.signingOrder,
        expiresAt: input.data.expiresAt,
      },
    })
    const documentRows = await attachDocuments(
      tx,
      created.id,
      t.documents.map((d) => d.document),
    )
    const envelopeDocumentByTemplateDocument = new Map(
      t.documents.map((d, i) => [d.id, documentRows[i] as string]),
    )
    // Supporting files: the envelope gets its own copies (the template keeps its objects).
    for (const [i, a] of t.attachments.entries()) {
      const row = await tx.envelopeAttachment.create({
        data: {
          envelopeId: created.id,
          name: a.name,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          sha256: a.sha256,
          s3Key: `pending:${crypto.randomUUID()}`,
          status: "READY",
          order: i,
          uploadedById: input.actor.userId,
        },
        select: { id: true },
      })
      const key = keys.attachment(input.organizationId, created.id, row.id)
      await copyObject(a.s3Key, key)
      await tx.envelopeAttachment.update({ where: { id: row.id }, data: { s3Key: key } })
    }
    const recipientIdByRole = new Map<string, string>()
    for (const { roleId, ...r } of draft.recipients) {
      const saved = await tx.recipient.create({ data: { ...r, envelopeId: created.id } })
      recipientIdByRole.set(roleId, saved.id)
    }
    // Copy only the layout: never the template field's own id (a second use would collide).
    await tx.field.createMany({
      data: draft.fields.map((f) => ({
        envelopeId: created.id,
        envelopeDocumentId: envelopeDocumentByTemplateDocument.get(f.templateDocumentId) as string,
        recipientId: recipientIdByRole.get(f.roleId) as string,
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
    await appendAuditEvent(tx, {
      envelopeId: created.id,
      type: "envelope.created",
      actorUserId: input.actor.userId,
      data: {
        documents: t.documents.map((d) => ({
          id: d.document.id,
          name: d.document.name,
          sha256: d.document.sha256,
        })),
        attachments: t.attachments.map((a) => ({ name: a.name, sha256: a.sha256 })),
        templateId: t.id,
        ...actorData(input.actor),
        ...input.auditExtra,
      },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    })
    return created
  })
}
