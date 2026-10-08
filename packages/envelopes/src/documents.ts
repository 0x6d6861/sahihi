import { MAX_ENVELOPE_DOCUMENTS, MAX_ENVELOPE_PAGES } from "@sahihi/core"
import { type Prisma, type PrismaClient, prisma } from "@sahihi/db"
import { EnvelopeError } from "./errors"

type Db = PrismaClient | Prisma.TransactionClient

export interface ReadyDocument {
  id: string
  name: string
  sha256: string | null
  pageCount: number | null
}

/**
 * The READY, non-deleted documents of `organizationId` named by `ids`, in that order (ADR 0037).
 * 404 when any is missing (or belongs to another workspace); 400 when the envelope would exceed
 * the document or page limits, counting `existing` (documents and pages already on the envelope).
 */
export async function loadReadyDocuments(
  organizationId: string,
  ids: readonly string[],
  existing: { documents: number; pages: number } = { documents: 0, pages: 0 },
  db: Db = prisma,
): Promise<ReadyDocument[]> {
  const rows = await db.document.findMany({
    where: { id: { in: [...ids] }, organizationId, deletedAt: null, status: "READY" },
    select: { id: true, name: true, sha256: true, pageCount: true },
  })
  const byId = new Map(rows.map((d) => [d.id, d]))
  const docs = ids.map((id) => byId.get(id))
  const missing = docs.findIndex((d) => !d)
  if (missing >= 0) {
    throw new EnvelopeError(404, "not_found", "Document not found", {
      issues: [{ path: `documentIds.${missing}`, message: "Document not found" }],
    })
  }
  const found = docs as ReadyDocument[]
  if (existing.documents + found.length > MAX_ENVELOPE_DOCUMENTS) {
    throw new EnvelopeError(
      400,
      "validation_error",
      `An envelope can hold up to ${MAX_ENVELOPE_DOCUMENTS} documents`,
    )
  }
  const pages = existing.pages + found.reduce((n, d) => n + (d.pageCount ?? 0), 0)
  if (pages > MAX_ENVELOPE_PAGES) {
    throw new EnvelopeError(
      400,
      "validation_error",
      `An envelope can hold up to ${MAX_ENVELOPE_PAGES} pages across its documents`,
    )
  }
  return found
}

/** Adds `documents` to an envelope after its current ones; returns the new rows' ids in order. */
export async function attachDocuments(
  tx: Prisma.TransactionClient,
  envelopeId: string,
  documents: readonly { id: string }[],
  startAt = 0,
): Promise<string[]> {
  const ids: string[] = []
  for (const [i, d] of documents.entries()) {
    const row = await tx.envelopeDocument.create({
      data: { envelopeId, documentId: d.id, order: startAt + i },
      select: { id: true },
    })
    ids.push(row.id)
  }
  return ids
}

/** What the audit trail records about a set of documents: id, name and the original's hash. */
export const documentsAuditData = (documents: readonly ReadyDocument[]) =>
  documents.map((d) => ({ id: d.id, name: d.name, sha256: d.sha256 }))
