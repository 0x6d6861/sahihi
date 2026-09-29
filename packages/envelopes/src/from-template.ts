import { draftFromTemplate, type UseTemplateInput } from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
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
      document: { select: { id: true, status: true, deletedAt: true, sha256: true } },
      roles: { select: roleSelect, orderBy: { order: "asc" } },
      fields: { select: fieldSelect },
    },
  })
  if (!template) notFound("Template")
  const t = template as NonNullable<typeof template>
  if (t.document.status !== "READY" || t.document.deletedAt) {
    throw new EnvelopeError(
      400,
      "document_unavailable",
      "This template's document is no longer available",
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
        documentId: t.document.id,
        createdById: input.actor.userId,
        title: input.data.title,
        message: input.data.message ?? t.message,
        signingOrder: t.signingOrder,
        expiresAt: input.data.expiresAt,
      },
    })
    const recipientIdByRole = new Map<string, string>()
    for (const { roleId, ...r } of draft.recipients) {
      const saved = await tx.recipient.create({ data: { ...r, envelopeId: created.id } })
      recipientIdByRole.set(roleId, saved.id)
    }
    // Copy only the layout: never the template field's own id (a second use would collide).
    await tx.field.createMany({
      data: draft.fields.map((f) => ({
        envelopeId: created.id,
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
        documentId: t.document.id,
        documentSha256: t.document.sha256,
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
