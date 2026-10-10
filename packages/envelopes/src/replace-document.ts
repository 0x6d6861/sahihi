import { isEditable } from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { loadReadyDocuments } from "./documents"
import { EnvelopeError, lockedFields, notFound } from "./errors"
import { type Actor, actorData } from "./send"

/**
 * Point one of a DRAFT's documents at another READY document of the workspace, e.g. the one
 * "Prepare document" just saved from it (ADR 0024, 0037). That document's fields are removed:
 * pages may have been reordered, rotated or deleted, so no position can be trusted. Fields on the
 * envelope's other documents stay. Audited with both hashes. The old document is not touched.
 * `envelopeDocumentId` omitted means the first document (older callers).
 */
export async function replaceEnvelopeDocument(input: {
  envelopeId: string
  organizationId: string
  documentId: string
  envelopeDocumentId?: string
  actor: Actor
}): Promise<{ documentId: string; envelopeDocumentId: string; fieldsRemoved: number }> {
  const envelope = await prisma.envelope.findFirst({
    where: { id: input.envelopeId, organizationId: input.organizationId },
    select: {
      id: true,
      status: true,
      documents: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          documentId: true,
          document: { select: { sha256: true, pageCount: true } },
        },
      },
    },
  })
  if (!envelope) notFound("Envelope")
  const e = envelope as NonNullable<typeof envelope>
  if (!isEditable(e.status)) {
    throw new EnvelopeError(409, "invalid_state", "Only draft envelopes can be edited")
  }
  const slot = input.envelopeDocumentId
    ? e.documents.find((d) => d.id === input.envelopeDocumentId)
    : e.documents[0]
  if (!slot) notFound("Envelope document")
  const current = slot as NonNullable<typeof slot>
  const locked = await prisma.field.count({
    where: { envelopeDocumentId: current.id, locked: true },
  })
  if (locked > 0) {
    lockedFields(
      "This document was drafted with AI and its fields sit on the lines it prints. Change it in the AI draft instead.",
    )
  }
  if (current.documentId === input.documentId) {
    return { documentId: input.documentId, envelopeDocumentId: current.id, fieldsRemoved: 0 }
  }
  if (e.documents.some((d) => d.id !== current.id && d.documentId === input.documentId)) {
    throw new EnvelopeError(409, "conflict", "That document is already in this envelope")
  }
  const others = e.documents.filter((d) => d.id !== current.id)
  const [next] = await loadReadyDocuments(input.organizationId, [input.documentId], {
    documents: others.length,
    pages: others.reduce((n, d) => n + (d.document.pageCount ?? 0), 0),
  })
  const doc = next as NonNullable<typeof next>

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.field.deleteMany({
      where: { envelopeId: e.id, envelopeDocumentId: current.id },
    })
    await tx.envelopeDocument.update({
      where: { id: current.id },
      data: { documentId: doc.id },
    })
    await appendAuditEvent(tx, {
      envelopeId: e.id,
      type: "envelope.document_replaced",
      actorUserId: input.actor.userId,
      data: {
        envelopeDocumentId: current.id,
        fromDocumentId: current.documentId,
        fromDocumentSha256: current.document.sha256,
        documentId: doc.id,
        documentSha256: doc.sha256,
        fieldsRemoved: count,
        ...actorData(input.actor),
      },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    })
    return { documentId: doc.id, envelopeDocumentId: current.id, fieldsRemoved: count }
  })
}
