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
  const userIds = await wantsNotification(db, input.organizationId, input.userIds, input.type)
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

/** The users among `userIds` who are members of the workspace and have the type turned on. */
async function wantsNotification(
  db: Db,
  organizationId: string,
  userIds: readonly string[],
  type: NotificationType,
): Promise<string[]> {
  const candidates = [...new Set(userIds)]
  if (candidates.length === 0) return []
  const [members, prefs] = await Promise.all([
    db.member.findMany({
      where: { organizationId, userId: { in: candidates } },
      select: { userId: true },
    }),
    db.notificationPreference.findMany({
      where: { organizationId, userId: { in: candidates } },
      select: { userId: true, settings: true },
    }),
  ])
  const settingsOf = new Map(prefs.map((p) => [p.userId, parseNotificationSettings(p.settings)]))
  return members
    .map((m) => m.userId)
    .filter((id) => isNotificationEnabled(type, settingsOf.get(id) ?? {}))
}

/**
 * Notifies the person who created the envelope, adding the envelope title (and the recipient's
 * name) to `data`. Skipped when they caused the change: `exceptUserId` is them, or `recipient` is
 * them (a sender who signs their own envelope). Membership and preferences are checked before any
 * name is looked up, so a type that's off (the default for "Opened") costs one envelope read.
 * `actorUserId` adds the actor's name as `actorName`, read only when a notification is written.
 */
export async function notifyEnvelopeOwner(
  db: Db,
  input: {
    envelopeId: string
    type: NotificationType
    /** The recipient who acted (callers already hold the row) */
    recipient?: { name: string; email: string }
    exceptUserId?: string
    actorUserId?: string
    data?: NotificationData
  },
): Promise<number> {
  if (NOTIFICATION_CATALOG[input.type].audience !== "owner") {
    throw new Error(`${input.type} is not an envelope owner notification`)
  }
  const envelope = await db.envelope.findUniqueOrThrow({
    where: { id: input.envelopeId },
    select: {
      organizationId: true,
      createdById: true,
      title: true,
      createdBy: { select: { email: true } },
    },
  })
  if (envelope.createdById === input.exceptUserId) return 0
  if (
    input.recipient &&
    input.recipient.email.toLowerCase() === envelope.createdBy.email.toLowerCase()
  ) {
    return 0
  }
  const [userId] = await wantsNotification(
    db,
    envelope.organizationId,
    [envelope.createdById],
    input.type,
  )
  if (!userId) return 0
  const actor = input.actorUserId
    ? await db.user.findUnique({
        where: { id: input.actorUserId },
        select: { name: true, email: true },
      })
    : null
  const data = {
    envelopeTitle: envelope.title,
    ...(input.recipient ? { recipientName: input.recipient.name || input.recipient.email } : {}),
    ...(actor ? { actorName: actor.name || actor.email } : {}),
    ...input.data,
  } as Prisma.InputJsonValue
  await db.notification.create({
    data: {
      organizationId: envelope.organizationId,
      userId,
      type: input.type,
      envelopeId: input.envelopeId,
      data,
    },
  })
  return 1
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
