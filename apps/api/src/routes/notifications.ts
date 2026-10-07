import {
  isNotificationEnabled,
  ListNotificationsQuerySchema,
  MarkNotificationsReadSchema,
  NotificationIdsSchema,
  type NotificationSettings,
  notificationTypesFor,
  parseNotificationSettings,
  UpdateNotificationPreferencesSchema,
} from "@sahihi/core"
import { forOrganization, type Prisma, prisma } from "@sahihi/db"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { badRequest, parseJson, parseQuery } from "../lib/http"
import { requireOrg } from "../middleware/session"

/**
 * The bell in the top bar and Settings → Notifications (docs/notifications.md). Everything here
 * belongs to the signed-in user in the active workspace: every query is scoped by both.
 */
const SELECT = {
  id: true,
  type: true,
  envelopeId: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const

function preferencesView(role: string, settings: NotificationSettings) {
  return {
    items: notificationTypesFor(role).map((type) => ({
      type,
      enabled: isNotificationEnabled(type, settings),
    })),
  }
}

export const notifications = new Hono<AppEnv>()
  .use(requireOrg)

  /** Newest first, keyset-paginated by `cursor` (the last id of the previous page). */
  .get("/", async (c) => {
    const query = parseQuery(c, ListNotificationsQuerySchema)
    const mine = forOrganization(c.get("organizationId")).notification({
      userId: c.get("user").id,
    })
    let after: Prisma.NotificationWhereInput = {}
    if (query.cursor) {
      const cursor = await prisma.notification.findFirst({
        where: { ...mine, id: query.cursor },
        select: { id: true, createdAt: true },
      })
      if (!cursor) badRequest("Unknown cursor")
      const { id, createdAt } = cursor as NonNullable<typeof cursor>
      after = { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] }
    }
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { ...mine, ...after, ...(query.unread ? { readAt: null } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: SELECT,
      }),
      prisma.notification.count({ where: { ...mine, readAt: null } }),
    ])
    const items = rows.slice(0, query.limit)
    const nextCursor = rows.length > query.limit ? (items.at(-1)?.id ?? null) : null
    return c.json({ items, nextCursor, unreadCount })
  })

  /** The badge on the bell, polled by the web app. */
  .get("/unread-count", async (c) => {
    const count = await prisma.notification.count({
      where: forOrganization(c.get("organizationId")).notification({
        userId: c.get("user").id,
        readAt: null,
      }),
    })
    return c.json({ count })
  })

  /** `{ ids }` marks those, `{ all: true }` marks everything unread. Already-read rows are kept as is. */
  .post("/read", async (c) => {
    const body = await parseJson(c, MarkNotificationsReadSchema)
    const { count } = await prisma.notification.updateMany({
      where: forOrganization(c.get("organizationId")).notification({
        userId: c.get("user").id,
        readAt: null,
        ...("ids" in body ? { id: { in: body.ids } } : {}),
      }),
      data: { readAt: new Date() },
    })
    return c.json({ updated: count })
  })

  /** Back to unread (the bell's "Mark unread"). Ids that aren't yours are ignored. */
  .post("/unread", async (c) => {
    const { ids } = await parseJson(c, NotificationIdsSchema)
    const { count } = await prisma.notification.updateMany({
      where: forOrganization(c.get("organizationId")).notification({
        userId: c.get("user").id,
        id: { in: ids },
        readAt: { not: null },
      }),
      data: { readAt: null },
    })
    return c.json({ updated: count })
  })

  /** Deletes your notifications (the bell's "Dismiss" and "Clear read"). Others' ids are ignored. */
  .post("/dismiss", async (c) => {
    const { ids } = await parseJson(c, NotificationIdsSchema)
    const { count } = await prisma.notification.deleteMany({
      where: forOrganization(c.get("organizationId")).notification({
        userId: c.get("user").id,
        id: { in: ids },
      }),
    })
    return c.json({ deleted: count })
  })

  /** The types this member can receive (members don't get workspace ones) and whether each is on. */
  .get("/preferences", async (c) => {
    const row = await prisma.notificationPreference.findUnique({
      where: {
        userId_organizationId: {
          userId: c.get("user").id,
          organizationId: c.get("organizationId"),
        },
      },
      select: { settings: true },
    })
    return c.json(preferencesView(c.get("memberRole"), parseNotificationSettings(row?.settings)))
  })

  /** Merges the given types into the stored choices. */
  .put("/preferences", async (c) => {
    const { settings } = await parseJson(c, UpdateNotificationPreferencesSchema)
    const userId = c.get("user").id
    const organizationId = c.get("organizationId")
    const merged = await prisma.$transaction(async (tx) => {
      // Two quick toggles must both land: serialise read-merge-write per user and workspace.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`notification-prefs:${userId}:${organizationId}`}))`
      const key = { userId_organizationId: { userId, organizationId } }
      const row = await tx.notificationPreference.findUnique({
        where: key,
        select: { settings: true },
      })
      const next = { ...parseNotificationSettings(row?.settings), ...settings }
      await tx.notificationPreference.upsert({
        where: key,
        create: { userId, organizationId, settings: next },
        update: { settings: next },
      })
      return next
    })
    return c.json(preferencesView(c.get("memberRole"), merged))
  })
