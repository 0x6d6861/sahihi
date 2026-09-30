import type { ApiCreateFromDocumentInput } from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { EnvelopeError, notFound } from "./errors"
import { type Actor, actorData } from "./send"

/**
 * Document + recipients + fields → DRAFT envelope in one transaction (public API). Recipients and
 * fields are validated by ApiCreateFromDocumentSchema; this checks the document and page numbers.
 */
export async function createEnvelopeFromDocument(input: {
  organizationId: string
  actor: Actor
  data: ApiCreateFromDocumentInput
}) {
  const d = input.data
  const doc = await prisma.document.findFirst({
    where: {
      id: d.documentId,
      organizationId: input.organizationId,
      deletedAt: null,
      status: "READY",
    },
    select: { id: true, sha256: true, pageCount: true },
  })
  if (!doc) notFound("Document")
  const document = doc as NonNullable<typeof doc>
  const bad = d.fields.findIndex((f) => f.page > (document.pageCount ?? 0))
  if (bad >= 0) {
    throw new EnvelopeError(400, "validation_error", `Page ${d.fields[bad]?.page} does not exist`, {
      issues: [{ path: `fields.${bad}.page`, message: "Page does not exist" }],
    })
  }
  if (d.expiresAt && d.expiresAt <= new Date()) {
    throw new EnvelopeError(400, "validation_error", "Pick a date in the future", {
      issues: [{ path: "expiresAt", message: "Pick a date in the future" }],
    })
  }

  return prisma.$transaction(async (tx) => {
    const envelope = await tx.envelope.create({
      data: {
        organizationId: input.organizationId,
        documentId: document.id,
        createdById: input.actor.userId,
        title: d.title,
        message: d.message ?? null,
        signingOrder: d.signingOrder,
        expiresAt: d.expiresAt,
      },
    })
    const ids: string[] = []
    for (const [i, r] of d.recipients.entries()) {
      const saved = await tx.recipient.create({
        data: {
          envelopeId: envelope.id,
          name: r.name,
          email: r.email,
          phone: r.phone ?? null,
          role: r.role,
          order: d.signingOrder === "SEQUENTIAL" ? r.order : 1,
          verification: r.verification,
          delivery: r.delivery,
          colorIndex: i,
        },
      })
      ids.push(saved.id)
    }
    await tx.field.createMany({
      data: d.fields.map((f) => ({
        envelopeId: envelope.id,
        recipientId: ids[f.recipient] as string,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        required: f.required,
        label: f.label ?? null,
      })),
    })
    await appendAuditEvent(tx, {
      envelopeId: envelope.id,
      type: "envelope.created",
      actorUserId: input.actor.userId,
      data: { documentId: document.id, documentSha256: document.sha256, ...actorData(input.actor) },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    })
    return envelope
  })
}
