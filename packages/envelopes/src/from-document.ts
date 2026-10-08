import { type ApiCreateFromDocumentInput, documentIdsOf } from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { attachDocuments, documentsAuditData, loadReadyDocuments } from "./documents"
import { EnvelopeError } from "./errors"
import { type Actor, actorData } from "./send"

/**
 * Documents + recipients + fields → DRAFT envelope in one transaction (public API). Recipients and
 * fields are validated by ApiCreateFromDocumentSchema; this checks the documents (READY, this
 * workspace, within limits) and each field's page in its own document (ADR 0037).
 */
export async function createEnvelopeFromDocument(input: {
  organizationId: string
  actor: Actor
  data: ApiCreateFromDocumentInput
}) {
  const d = input.data
  const documents = await loadReadyDocuments(input.organizationId, documentIdsOf(d))
  const bad = d.fields.findIndex((f) => f.page > (documents[f.document]?.pageCount ?? 0))
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
        createdById: input.actor.userId,
        title: d.title,
        message: d.message ?? null,
        signingOrder: d.signingOrder,
        expiresAt: d.expiresAt,
      },
    })
    const documentRows = await attachDocuments(tx, envelope.id, documents)
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
        envelopeDocumentId: documentRows[f.document] as string,
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
      data: { documents: documentsAuditData(documents), ...actorData(input.actor) },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    })
    return envelope
  })
}
