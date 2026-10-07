import type { ComponentType } from "react"
import {
  BanIcon,
  BellIcon,
  EraserIcon,
  EyeIcon,
  FilePenLineIcon,
  KeyRoundIcon,
  MailIcon,
  PenLineIcon,
  SendIcon,
  ShieldCheckIcon,
  SignatureIcon,
  TriangleAlertIcon,
  XIcon,
} from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import type { TimelineEvent } from "@/components/arc/timeline/timeline"
import { Timeline } from "@/components/arc/timeline/timeline"
import { auditEventLabel, auditEventTone } from "@/lib/audit-labels"

const TONE: Record<ReturnType<typeof auditEventTone>, TimelineEvent["tone"]> = {
  success: "success",
  error: "danger",
  warning: "neutral",
  info: "neutral",
  outline: "neutral",
}

/** One glyph per kind of event, so the feed scans without reading every line. */
const ICON_BY_TYPE: Record<string, ComponentType<{ "aria-hidden"?: boolean }>> = {
  "envelope.created": FilePenLineIcon,
  "envelope.document_replaced": FilePenLineIcon,
  "envelope.sent": SendIcon,
  "envelope.completed": ShieldCheckIcon,
  "certificate.issued": ShieldCheckIcon,
  "document.finalized": ShieldCheckIcon,
  "envelope.voided": BanIcon,
  "envelope.declined": XIcon,
  "recipient.declined": XIcon,
  "envelope.expired": TriangleAlertIcon,
  "envelope.purged": EraserIcon,
  "recipient.notified": MailIcon,
  "recipient.link_issued": MailIcon,
  "recipient.reminded": BellIcon,
  "recipient.viewed": EyeIcon,
  "recipient.link_opened": EyeIcon,
  "recipient.otp_sent": KeyRoundIcon,
  "recipient.otp_verified": KeyRoundIcon,
  "recipient.otp_failed": KeyRoundIcon,
  "recipient.consented": PenLineIcon,
  "recipient.field_filled": PenLineIcon,
  "recipient.signed": SignatureIcon,
}

export interface AuditEventRow {
  seq: number
  type: string
  recipientId: string | null
  actorUserId: string | null
  data: Record<string, unknown> | null
  ipAddress: string | null
  occurredAt: string
}

export type ChainVerification =
  | { valid: true }
  | { valid: false; brokenAtSeq: number; reason: string }

/**
 * The envelope's audit trail as an Arc timeline (newest first, grouped by day in Nairobi time), with
 * the hash-chain check the API ran. `now` comes from the server render so labels match on hydration.
 */
export function ActivityList({
  events,
  verification,
  recipientNames,
  now,
}: {
  events: AuditEventRow[]
  verification: ChainVerification
  recipientNames: Record<string, string>
  now: number
}) {
  const timeline: TimelineEvent[] = events.map((e) => ({
    id: String(e.seq),
    at: e.occurredAt,
    title: auditEventLabel(e.type, e.recipientId ? recipientNames[e.recipientId] : null, e.data),
    meta: [`Event ${e.seq}`, e.ipAddress && `IP ${e.ipAddress}`].filter(Boolean).join(" · "),
    tone: TONE[auditEventTone(e.type)],
    icon: (() => {
      const Icon = ICON_BY_TYPE[e.type]
      return Icon ? <Icon aria-hidden /> : undefined
    })(),
  }))
  return (
    <div className="flex flex-col gap-4">
      {verification.valid ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Badge tone="success" size="sm">
            Verified
          </Badge>
          The audit trail is intact: {events.length} {events.length === 1 ? "event" : "events"},
          each hash-chained to the one before.
        </p>
      ) : (
        <Alert tone="danger" title="Audit trail check failed">
          The chain breaks at event #{verification.brokenAtSeq} ({verification.reason}). Contact
          support before relying on this envelope.
        </Alert>
      )}
      <Timeline
        events={timeline}
        now={now}
        label="Envelope activity"
        timeZone="Africa/Nairobi"
        locale="en-GB"
        headingLevel={3}
      />
    </div>
  )
}
