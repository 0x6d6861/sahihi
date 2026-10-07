import { z } from "zod"
import { hasPermission } from "../workspace/permissions"

/**
 * In-app notifications (docs/notifications.md, ADR 0029). The bell in the top bar lists what
 * happened to your envelopes and, for owners and admins, to the workspace. Rows are written in the
 * same transaction as the change they report; email notifications are a separate system
 * (apps/worker/src/jobs/notifications.ts) and aren't affected by these preferences.
 */

export const NOTIFICATION_TYPES = [
  "recipient.viewed",
  "recipient.signed",
  "envelope.completed",
  "envelope.declined",
  "envelope.expired",
  "envelope.voided",
  "bulk_send.finished",
  "export.ready",
  "export.failed",
  "member.joined",
  "billing.quota_warning",
  "billing.quota_reached",
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/**
 * Who receives a type. `owner`: the person who created the envelope, bulk send or export.
 * `admins`: every owner and admin of the workspace (members who manage members).
 */
export type NotificationAudience = "owner" | "admins"
export type NotificationGroup = "envelopes" | "workspace"

export interface NotificationKind {
  group: NotificationGroup
  audience: NotificationAudience
  /** Settings → Notifications */
  label: string
  description: string
  /** Used until the person changes it */
  defaultEnabled: boolean
}

export const NOTIFICATION_CATALOG: Record<NotificationType, NotificationKind> = {
  "recipient.viewed": {
    group: "envelopes",
    audience: "owner",
    label: "Opened",
    description: "A recipient opens your envelope for the first time.",
    defaultEnabled: false,
  },
  "recipient.signed": {
    group: "envelopes",
    audience: "owner",
    label: "Signed",
    description: "A recipient signs and others still have to.",
    defaultEnabled: true,
  },
  "envelope.completed": {
    group: "envelopes",
    audience: "owner",
    label: "Completed",
    description: "Everyone has signed and the signed PDF is ready.",
    defaultEnabled: true,
  },
  "envelope.declined": {
    group: "envelopes",
    audience: "owner",
    label: "Declined",
    description: "A recipient declines to sign.",
    defaultEnabled: true,
  },
  "envelope.expired": {
    group: "envelopes",
    audience: "owner",
    label: "Expired",
    description: "An envelope passes its deadline before everyone signs.",
    defaultEnabled: true,
  },
  "envelope.voided": {
    group: "envelopes",
    audience: "owner",
    label: "Voided by someone else",
    description: "Another member voids one of your envelopes.",
    defaultEnabled: true,
  },
  "bulk_send.finished": {
    group: "envelopes",
    audience: "owner",
    label: "Bulk send finished",
    description: "Every row of your bulk send has been sent or has failed.",
    defaultEnabled: true,
  },
  "export.ready": {
    group: "workspace",
    audience: "owner",
    label: "Export ready",
    description: "The workspace export you asked for can be downloaded.",
    defaultEnabled: true,
  },
  "export.failed": {
    group: "workspace",
    audience: "owner",
    label: "Export failed",
    description: "The workspace export you asked for couldn't be built.",
    defaultEnabled: true,
  },
  "member.joined": {
    group: "workspace",
    audience: "admins",
    label: "Member joined",
    description: "Someone accepts an invitation to the workspace.",
    defaultEnabled: true,
  },
  "billing.quota_warning": {
    group: "workspace",
    audience: "admins",
    label: "Envelopes running low",
    description: "The workspace has used 80% of this month's envelopes.",
    defaultEnabled: true,
  },
  "billing.quota_reached": {
    group: "workspace",
    audience: "admins",
    label: "Envelope limit reached",
    description: "The workspace has used every envelope in this month's plan.",
    defaultEnabled: true,
  },
}

/** Notifications are deleted after this many days, read or not. */
export const NOTIFICATION_TTL_DAYS = 90

/** Owners and admins: the members who get `admins` notifications. */
export function receivesAdminNotifications(role: string): boolean {
  return hasPermission(role, { member: ["create"] })
}

/** The types a member with this role can receive, in catalog order. */
export function notificationTypesFor(role: string): NotificationType[] {
  const admin = receivesAdminNotifications(role)
  return NOTIFICATION_TYPES.filter((t) => admin || NOTIFICATION_CATALOG[t].audience === "owner")
}

// ── Preferences ──────────────────────────────────────────────────────────────

/** Stored per user and workspace: only the types the person changed. */
export type NotificationSettings = Partial<Record<NotificationType, boolean>>

export const NotificationSettingsSchema = z.partialRecord(z.enum(NOTIFICATION_TYPES), z.boolean())

export const UpdateNotificationPreferencesSchema = z.object({
  settings: NotificationSettingsSchema,
})
export type UpdateNotificationPreferencesInput = z.infer<typeof UpdateNotificationPreferencesSchema>

/** Reads stored settings leniently: unknown keys and non-boolean values are ignored. */
export function parseNotificationSettings(raw: unknown): NotificationSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: NotificationSettings = {}
  for (const t of NOTIFICATION_TYPES) {
    const v = (raw as Record<string, unknown>)[t]
    if (typeof v === "boolean") out[t] = v
  }
  return out
}

export function isNotificationEnabled(type: NotificationType, settings: NotificationSettings) {
  return settings[type] ?? NOTIFICATION_CATALOG[type].defaultEnabled
}

// ── Requests ─────────────────────────────────────────────────────────────────

export const NOTIFICATION_PAGE_SIZE = 20

export const ListNotificationsQuerySchema = z.object({
  /** The id of the last item of the previous page */
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(NOTIFICATION_PAGE_SIZE),
  unread: z
    .enum(["1", "true"])
    .optional()
    .transform((v) => v !== undefined),
})

const NotificationIds = z.array(z.string().min(1).max(64)).min(1).max(100)

export const MarkNotificationsReadSchema = z.union([
  z.object({ ids: NotificationIds }),
  z.object({ all: z.literal(true) }),
])
export type MarkNotificationsReadInput = z.infer<typeof MarkNotificationsReadSchema>

/** Mark unread, dismiss: always by id. */
export const NotificationIdsSchema = z.object({ ids: NotificationIds })
export type NotificationIdsInput = z.infer<typeof NotificationIdsSchema>

// ── Quota thresholds ─────────────────────────────────────────────────────────

/** Share of the monthly envelope quota that triggers the warning. */
export const QUOTA_WARNING_RATIO = 0.8

/**
 * The quota notification due after a send brings the period's count to `usedAfter`, if any.
 * Sends are serialised per workspace and the count only grows, so each threshold is crossed by
 * exactly one send per period: no state is needed to send each notification once.
 */
export function quotaNotificationFor(
  limit: number | null,
  usedAfter: number,
): "billing.quota_warning" | "billing.quota_reached" | null {
  if (limit === null || limit <= 0) return null
  if (usedAfter === limit) return "billing.quota_reached"
  const warnAt = Math.ceil(limit * QUOTA_WARNING_RATIO)
  if (warnAt < limit && usedAfter === warnAt) return "billing.quota_warning"
  return null
}

// ── Display ──────────────────────────────────────────────────────────────────

/**
 * What a notification stores in `data`: a snapshot of names at the time, so the text stays
 * readable if things are renamed. Every field is optional; display falls back to generic words.
 */
export interface NotificationData {
  envelopeTitle?: string
  recipientName?: string
  /** Decline or void reason */
  reason?: string
  actorName?: string
  memberName?: string
  bulkSendId?: string
  bulkSendTitle?: string
  sent?: number
  failed?: number
  envelopeCount?: number
  planName?: string
  used?: number
  limit?: number
}

export interface NotificationView {
  title: string
  /** One sentence shown under the title; always present */
  body: string
  /** success: done, warning: needs attention, info: everything else */
  tone: "info" | "success" | "warning"
  /** In-app path to open */
  href: string | null
}

const quoted = (s: string | undefined) => (s ? `“${s}”` : "an envelope")
const someone = (s: string | undefined) => s || "Someone"
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Title, body and link for a stored notification. Unknown types get a generic line. */
export function describeNotification(n: {
  type: string
  data: unknown
  envelopeId?: string | null
}): NotificationView {
  const d = (n.data && typeof n.data === "object" ? n.data : {}) as NotificationData
  const envelopeHref = n.envelopeId ? `/envelopes/${n.envelopeId}` : null
  const title = quoted(d.envelopeTitle)
  switch (n.type as NotificationType) {
    case "recipient.viewed":
      return {
        title: `${someone(d.recipientName)} opened ${title}`,
        body: "They opened it for the first time and haven't signed yet.",
        tone: "info",
        href: envelopeHref,
      }
    case "recipient.signed":
      return {
        title: `${someone(d.recipientName)} signed ${title}`,
        body: "Waiting on the other recipients.",
        tone: "info",
        href: envelopeHref,
      }
    case "envelope.completed":
      return {
        title: `${capitalize(title)} is complete`,
        body: "Everyone has signed. The signed PDF and certificate are ready.",
        tone: "success",
        href: envelopeHref,
      }
    case "envelope.declined":
      return {
        title: `${someone(d.recipientName)} declined ${title}`,
        body: d.reason ? `“${d.reason}”` : "No reason given.",
        tone: "warning",
        href: envelopeHref,
      }
    case "envelope.expired":
      return {
        title: `${capitalize(title)} expired`,
        body: "Not everyone signed before the deadline.",
        tone: "warning",
        href: envelopeHref,
      }
    case "envelope.voided":
      return {
        title: `${someone(d.actorName)} voided ${title}`,
        body: d.reason ? `“${d.reason}”` : "No reason given.",
        tone: "warning",
        href: envelopeHref,
      }
    case "bulk_send.finished": {
      const parts = [`${d.sent ?? 0} sent`]
      if (d.failed) parts.push(`${d.failed} failed`)
      return {
        title: `Bulk send ${d.bulkSendTitle ? `“${d.bulkSendTitle}” ` : ""}finished`,
        body: parts.join(", "),
        tone: d.failed ? "warning" : "success",
        href: d.bulkSendId ? `/bulk-sends/${d.bulkSendId}` : null,
      }
    }
    case "export.ready":
      return {
        title: "Your workspace export is ready",
        body:
          d.envelopeCount === undefined
            ? "Download it from Settings → Data."
            : `${d.envelopeCount} ${d.envelopeCount === 1 ? "envelope" : "envelopes"}. Download it from Settings → Data.`,
        tone: "success",
        href: "/settings/data",
      }
    case "export.failed":
      return {
        title: "Your workspace export failed",
        body: "Try again from Settings → Data.",
        tone: "warning",
        href: "/settings/data",
      }
    case "member.joined":
      return {
        title: `${someone(d.memberName)} joined the workspace`,
        body: "They accepted your invitation. Manage roles in Settings → Members.",
        tone: "info",
        href: "/settings/members",
      }
    case "billing.quota_warning":
      return {
        title: "Envelopes are running low",
        body:
          d.used !== undefined && d.limit !== undefined
            ? `${d.used} of ${d.limit} envelopes sent this month${d.planName ? ` on the ${d.planName} plan` : ""}.`
            : "Most of this month's envelopes are used. See Settings → Plan & usage.",
        tone: "warning",
        href: "/settings/billing",
      }
    case "billing.quota_reached":
      return {
        title: "Envelope limit reached",
        body: `No more envelopes can be sent until next month${d.limit !== undefined ? ` (${d.limit} a month${d.planName ? ` on the ${d.planName} plan` : ""})` : ""}.`,
        tone: "warning",
        href: "/settings/billing",
      }
    default:
      return { title: "Notification", body: "Something changed.", tone: "info", href: envelopeHref }
  }
}

/** Longest reason quoted in a notification; the full text stays on the envelope. */
export const NOTIFICATION_REASON_MAX = 200

export function truncateReason(reason: string | null | undefined): string | undefined {
  if (!reason) return undefined
  const s = reason.trim()
  return s.length > NOTIFICATION_REASON_MAX ? `${s.slice(0, NOTIFICATION_REASON_MAX - 1)}…` : s
}
