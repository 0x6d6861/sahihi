import { type AuditEventType, type ChainedAuditEvent, chainAuditEvent } from "@sahihi/core"
import { type AuditEvent, Prisma } from "./generated/prisma/client"

export interface AppendAuditInput {
  envelopeId: string
  type: AuditEventType
  recipientId?: string | null
  actorUserId?: string | null
  data?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
  occurredAt?: Date
}

/**
 * The ONLY way to write audit events. Must run inside a transaction so the
 * event commits atomically with the state change it describes.
 * A per-envelope advisory lock serialises writers so `seq` has no gaps.
 */
export async function appendAuditEvent(tx: Prisma.TransactionClient, input: AppendAuditInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.envelopeId}))`
  const last = await tx.auditEvent.findFirst({
    where: { envelopeId: input.envelopeId },
    orderBy: { seq: "desc" },
    select: { seq: true, hash: true },
  })
  // Truncate to ms: Postgres timestamp(3) must round-trip for hash verification
  const occurredAt = new Date(Math.floor((input.occurredAt ?? new Date()).getTime()))
  const ev = await chainAuditEvent(last, {
    envelopeId: input.envelopeId,
    type: input.type,
    recipientId: input.recipientId ?? null,
    actorUserId: input.actorUserId ?? null,
    data: input.data ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    occurredAt: occurredAt.toISOString(),
  })
  return tx.auditEvent.create({
    data: {
      envelopeId: ev.envelopeId,
      seq: ev.seq,
      type: ev.type,
      recipientId: ev.recipientId,
      actorUserId: ev.actorUserId,
      data: ev.data === null ? Prisma.DbNull : (ev.data as Prisma.InputJsonObject),
      ipAddress: ev.ipAddress,
      userAgent: ev.userAgent,
      occurredAt,
      prevHash: ev.prevHash,
      hash: ev.hash,
    },
  })
}

/** Map DB rows back to the shape verifyAuditChain() expects. */
export function toChainedEvent(row: AuditEvent): ChainedAuditEvent {
  return {
    envelopeId: row.envelopeId,
    seq: row.seq,
    type: row.type as AuditEventType,
    recipientId: row.recipientId,
    actorUserId: row.actorUserId,
    data: (row.data as Record<string, unknown> | null) ?? null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    occurredAt: row.occurredAt.toISOString(),
    prevHash: row.prevHash,
    hash: row.hash,
  }
}
