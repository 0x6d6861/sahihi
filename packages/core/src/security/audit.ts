import { sha256Hex } from "./crypto"

/**
 * Audit trail: append-only, hash-chained per envelope.
 *   hash_n = sha256(prevHash_(n-1) + "\n" + canonicalJson(payload_n))
 * The first event has prevHash = null (hashed as "GENESIS").
 * Any edit/deletion/reordering breaks verifyAuditChain().
 */

export const AUDIT_EVENT_TYPES = [
  "envelope.created",
  /** A draft switched to another document (e.g. after "Prepare document"); fields were removed. */
  "envelope.document_replaced",
  "envelope.document_added",
  "envelope.document_removed",
  "envelope.documents_reordered",
  "envelope.attachment_added",
  "envelope.attachment_removed",
  "envelope.sent",
  "envelope.voided",
  "envelope.expired",
  "envelope.completed",
  "envelope.declined",
  "recipient.notified",
  "recipient.reminded",
  "recipient.link_opened",
  /** An embedded signing URL was issued through the API (docs/embedded-signing.md). */
  "recipient.link_issued",
  "recipient.otp_sent",
  "recipient.otp_verified",
  "recipient.otp_failed",
  "recipient.consented",
  "recipient.viewed",
  "recipient.attachment_viewed",
  "recipient.field_filled",
  "recipient.signed",
  "recipient.declined",
  "document.finalized",
  "certificate.issued",
  /** Files and personal data deleted (retention or on request); evidence kept (docs/data-retention.md). */
  "envelope.purged",
] as const
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]

export interface AuditPayload {
  envelopeId: string
  seq: number
  type: AuditEventType
  recipientId: string | null
  actorUserId: string | null
  data: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  /** ISO-8601 */
  occurredAt: string
}

export interface ChainedAuditEvent extends AuditPayload {
  prevHash: string | null
  hash: string
}

/** Deterministic JSON: object keys sorted recursively, undefined dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`
}

export async function computeAuditHash(prevHash: string | null, payload: AuditPayload) {
  return sha256Hex(`${prevHash ?? "GENESIS"}\n${canonicalJson(payload)}`)
}

export async function chainAuditEvent(
  prev: Pick<ChainedAuditEvent, "hash" | "seq"> | null,
  payload: Omit<AuditPayload, "seq">,
): Promise<ChainedAuditEvent> {
  const full: AuditPayload = { ...payload, seq: prev ? prev.seq + 1 : 1 }
  const prevHash = prev?.hash ?? null
  return { ...full, prevHash, hash: await computeAuditHash(prevHash, full) }
}

export type ChainVerification =
  | { valid: true }
  | { valid: false; brokenAtSeq: number; reason: string }

export async function verifyAuditChain(events: ChainedAuditEvent[]): Promise<ChainVerification> {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  let prev: ChainedAuditEvent | null = null
  for (const e of sorted) {
    const expectedSeq: number = prev ? prev.seq + 1 : 1
    if (e.seq !== expectedSeq) return { valid: false, brokenAtSeq: e.seq, reason: "sequence gap" }
    if (e.prevHash !== (prev?.hash ?? null))
      return { valid: false, brokenAtSeq: e.seq, reason: "prevHash mismatch" }
    const { prevHash: _p, hash, ...payload } = e
    if ((await computeAuditHash(e.prevHash, payload)) !== hash)
      return { valid: false, brokenAtSeq: e.seq, reason: "hash mismatch" }
    prev = e
  }
  return { valid: true }
}
