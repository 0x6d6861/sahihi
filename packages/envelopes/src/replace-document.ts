import { isEditable } from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { EnvelopeError, notFound } from "./errors"
import { type Actor, actorData } from "./send"

/**
 * Point a DRAFT at another READY document of the workspace, e.g. the one "Prepare document" just
 * saved from its current one (ADR 0024). Every placed field is removed: pages may have been
 * reordered, rotated or deleted, so no position can be trusted. Audited with both hashes, since
 * `envelope.created` recorded the first document's. The old document is not touched.
 */
export async function replaceEnvelopeDocument(input: {
  envelopeId: string
  organizationId: string
  documentId: string
  actor: Actor
}): Promise<{ documentId: string; fieldsRemoved: number }> {
  const envelope = await prisma.envelope.findFirst({
    where: { id: input.envelopeId, organizationId: input.organizationId },
    select: { id: true, status: true, document: { select: { id: true, sha256: true } } },
  })
  if (!envelope) notFound("Envelope")
  const e = envelope as NonNullable<typeof envelope>
  if (!isEditable(e.status)) {
    throw new EnvelopeError(409, "invalid_state", "Only draft envelopes can be edited")
  }
  const doc = await prisma.document.findFirst({
    where: {
      id: input.documentId,
      organizationId: input.organizationId,
      deletedAt: null,
      status: "READY",
    },
    select: { id: true, sha256: true },
  })
  if (!doc) notFound("Document")
  const next = doc as NonNullable<typeof doc>
  if (next.id === e.document.id) return { documentId: next.id, fieldsRemoved: 0 }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.field.deleteMany({ where: { envelopeId: e.id } })
    await tx.envelope.update({ where: { id: e.id }, data: { documentId: next.id } })
    await appendAuditEvent(tx, {
      envelopeId: e.id,
      type: "envelope.document_replaced",
      actorUserId: input.actor.userId,
      data: {
        fromDocumentId: e.document.id,
        fromDocumentSha256: e.document.sha256,
        documentId: next.id,
        documentSha256: next.sha256,
        fieldsRemoved: count,
        ...actorData(input.actor),
      },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    })
    return { documentId: next.id, fieldsRemoved: count }
  })
}
