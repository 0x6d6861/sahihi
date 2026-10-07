import {
  isNotificationEnabled,
  NOTIFICATION_CATALOG,
  type NotificationData,
  type NotificationType,
  parseNotificationSettings,
  receivesAdminNotifications,
} from "@sahihi/core"
import type { Prisma, PrismaClient } from "./generated/prisma/client"

type Db = PrismaClient | Prisma.TransactionClient

/**
 * In-app notifications (docs/notifications.md). Call inside the SAME transaction as the change
 * being reported, so a notification exists if and only if the change committed. Nothing is
 * enqueued: the web app polls.
 *
 * Users who are no longer members of the workspace, and users who turned the type off in
 * Settings → Notifications, are skipped. Returns how many rows were written.
 */
export async function notifyUsers(
  db: Db,
  input: {
    organizationId: string
    userIds: readonly string[]
    type: NotificationType
    envelopeId?: string | null
    data?: NotificationData
  },
): Promise<number> {
  const candidates = [...new Set(input.userIds)]
  if (candidates.length === 0) return 0
  const [members, prefs] = await Promise.all([
    db.member.findMany({
      where: { organizationId: input.organizationId, userId: { in: candidates } },
      select: { userId: true },
    }),
    db.notificationPreference.findMany({
      where: { organizationId: input.organizationId, userId: { in: candidates } },
      select: { userId: true, settings: true },
    }),
  ])
  const settingsOf = new Map(prefs.map((p) => [p.userId, parseNotificationSettings(p.settings)]))
  const userIds = members
    .map((m) => m.userId)
    .filter((id) => isNotificationEnabled(input.type, settingsOf.get(id) ?? {}))
  if (userIds.length === 0) return 0
  const data = (input.data ?? {}) as Prisma.InputJsonValue
  const res = await db.notification.createMany({
    data: userIds.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      type: input.type,
      envelopeId: input.envelopeId ?? null,
      data,
    })),
  })
  return res.count
}

/**
 * Notifies the person who created the envelope. Adds the envelope title (and the recipient's name
 * when `recipientId` is given) to `data`. `exceptUserId` skips them when they caused the change.
 */
export async function notifyEnvelopeOwner(
  db: Db,
  input: {
    envelopeId: string
    type: NotificationType
    recipientId?: string
    exceptUserId?: string
    data?: NotificationData
  },
): Promise<number> {
  if (NOTIFICATION_CATALOG[input.type].audience !== "owner") {
    throw new Error(`${input.type} is not an envelope owner notification`)
  }
  const envelope = await db.envelope.findUniqueOrThrow({
    where: { id: input.envelopeId },
    select: { organizationId: true, createdById: true, title: true },
  })
  if (envelope.createdById === input.exceptUserId) return 0
  const recipient = input.recipientId
    ? await db.recipient.findUnique({
        where: { id: input.recipientId },
        select: { name: true, email: true },
      })
    : null
  return notifyUsers(db, {
    organizationId: envelope.organizationId,
    userIds: [envelope.createdById],
    type: input.type,
    envelopeId: input.envelopeId,
    data: {
      envelopeTitle: envelope.title,
      ...(recipient ? { recipientName: recipient.name || recipient.email } : {}),
      ...input.data,
    },
  })
}

/** Notifies every owner and admin of the workspace (`admins` audience types). */
export async function notifyWorkspaceAdmins(
  db: Db,
  input: {
    organizationId: string
    type: NotificationType
    exceptUserId?: string
    data?: NotificationData
  },
): Promise<number> {
  if (NOTIFICATION_CATALOG[input.type].audience !== "admins") {
    throw new Error(`${input.type} is not a workspace admin notification`)
  }
  const members = await db.member.findMany({
    where: { organizationId: input.organizationId },
    select: { userId: true, role: true },
  })
  const userIds = members
    .filter((m) => m.userId !== input.exceptUserId && receivesAdminNotifications(m.role))
    .map((m) => m.userId)
  return notifyUsers(db, {
    organizationId: input.organizationId,
    userIds,
    type: input.type,
    data: input.data,
  })
}
