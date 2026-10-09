import { z } from "zod"
import { decodeNotificationCursor, encodeNotificationCursor } from "../notifications/notifications"
import { AUDIT_EVENT_TYPES, type AuditEventType } from "../security/audit"
import { DOCUMENT_PERIODS } from "../workspace/folders"

/**
 * The workspace activity feed in the Inbox (docs/notifications.md → Inbox, ADR 0041): the audit
 * events of every envelope in the workspace, newest first, read-only.
 */

/** Step-by-step noise: kept on the envelope's own Activity tab, left out of the workspace feed. */
const NOISY: readonly AuditEventType[] = [
  "recipient.link_opened",
  "recipient.otp_sent",
  "recipient.otp_verified",
  "recipient.otp_failed",
  "recipient.field_filled",
]

export const ACTIVITY_GROUPS = ["all", "signing", "sending", "system"] as const
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number]

const GROUP_TYPES: Record<Exclude<ActivityGroup, "all">, readonly AuditEventType[]> = {
  /** What recipients did */
  signing: [
    "recipient.consented",
    "recipient.viewed",
    "recipient.attachment_viewed",
    "recipient.signed",
    "recipient.declined",
    "envelope.completed",
    "envelope.declined",
  ],
  /** What senders did */
  sending: [
    "envelope.created",
    "envelope.document_replaced",
    "envelope.document_added",
    "envelope.document_removed",
    "envelope.documents_reordered",
    "envelope.attachment_added",
    "envelope.attachment_removed",
    "envelope.sent",
    "envelope.voided",
    "recipient.notified",
    "recipient.reminded",
    "recipient.link_issued",
  ],
  /** What the platform did */
  system: ["envelope.expired", "document.finalized", "certificate.issued", "envelope.purged"],
}

/** The audit event types a group shows. */
export function activityTypesFor(group: ActivityGroup): AuditEventType[] {
  if (group === "all") return AUDIT_EVENT_TYPES.filter((t) => !NOISY.includes(t))
  return [...GROUP_TYPES[group]]
}

export const ACTIVITY_PAGE_SIZE = 30

export const ListActivityQuerySchema = z.object({
  /** `nextCursor` of the previous page (`encodeActivityCursor`) */
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(ACTIVITY_PAGE_SIZE),
  group: z.enum(ACTIVITY_GROUPS).default("all"),
  /** Envelope title, recipient name or the name of the member who acted */
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  /** A member's user id: only what they did */
  actor: z.string().min(1).max(64).optional(),
  period: z.enum(DOCUMENT_PERIODS).optional(),
})

/** Keyset cursor on the last event's position (`occurredAt` and id), as for notifications. */
export function encodeActivityCursor(item: { occurredAt: Date; id: string }): string {
  return encodeNotificationCursor({ createdAt: item.occurredAt, id: item.id })
}

export function decodeActivityCursor(cursor: string): { occurredAt: Date; id: string } | null {
  const position = decodeNotificationCursor(cursor)
  return position ? { occurredAt: position.createdAt, id: position.id } : null
}

/**
 * The part of an audit event's `data` the workspace feed may show: what its line quotes (a reason,
 * a file name, the documents added). Hashes, emails, storage keys and the rest stay on the
 * envelope's own Activity tab.
 */
export function activityData(data: unknown): {
  reason?: string
  name?: string
  documentName?: string
  documents?: { name: string }[]
} | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const text = (v: unknown) => (typeof v === "string" ? v : undefined)
  const documents = Array.isArray(d.documents)
    ? d.documents.flatMap((doc) =>
        doc && typeof doc === "object" && typeof (doc as { name?: unknown }).name === "string"
          ? [{ name: (doc as { name: string }).name }]
          : [],
      )
    : undefined
  const out = {
    ...(text(d.reason) !== undefined && { reason: text(d.reason) }),
    ...(text(d.name) !== undefined && { name: text(d.name) }),
    ...(text(d.documentName) !== undefined && { documentName: text(d.documentName) }),
    ...(documents && { documents }),
  }
  return Object.keys(out).length > 0 ? out : null
}
