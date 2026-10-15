import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  isNotificationEnabled,
  ListNotificationsQuerySchema,
  MarkNotificationsReadSchema,
  NOTIFICATION_SEARCH_KEYS,
  NotificationIdsSchema,
  type NotificationSettings,
  notificationTypesFor,
  parseNotificationSettings,
  periodStart,
  UpdateNotificationPreferencesSchema,
} from "@sahihi/core"
import { forOrganization, type Prisma, prisma, signalNotifications } from "@sahihi/db"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { AppEnv } from "../lib/env"
import { badRequest, parseJson, parseQuery } from "../lib/http"
import { subscribeToNotifications } from "../lib/notification-hub"
import { requireOrg } from "../middleware/session"

/**
 * The Inbox (ADR 0041) and Settings → Notifications (docs/notifications.md). Everything here
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

function unreadCount(organizationId: string, userId: string) {
  return prisma.notification.count({
    where: forOrganization(organizationId).notification({ userId, readAt: null }),
  })
}

/** Batches a burst of signals (a bulk send, "Mark all read") into one count query. */
const STREAM_DEBOUNCE_MS = 250
/** Keeps proxies and Bun from closing a quiet stream. */
const STREAM_HEARTBEAT_MS = 20_000
/**
 * Then the server ends the stream and the browser reconnects through `requireOrg` again, so a
 * revoked session or a removed member stops hearing within minutes.
 */
const STREAM_LIFETIME_MS = 10 * 60_000

export const notifications = new Hono<AppEnv>()
  .use(requireOrg)

  /**
   * Newest first, keyset-paginated by `cursor` (the previous page's `nextCursor`: a position, so it
   * holds even if that item was dismissed meanwhile). The Inbox's search and chips narrow it:
   * `unread` or `read`, `type`, `period` and `q` (the names and titles it quotes, any case).
   * `unreadCount` always counts every unread one.
   */
  .get("/", async (c) => {
    const query = parseQuery(c, ListNotificationsQuerySchema)
    const mine = forOrganization(c.get("organizationId")).notification({
      userId: c.get("user").id,
    })
    let after: Prisma.NotificationWhereInput = {}
    if (query.cursor) {
      const cursor = decodeNotificationCursor(query.cursor)
      if (!cursor) badRequest("Invalid cursor")
      const { id, createdAt } = cursor as NonNullable<typeof cursor>
      after = { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] }
    }
    const filters: Prisma.NotificationWhereInput = {
      ...(query.unread ? { readAt: null } : query.read ? { readAt: { not: null } } : {}),
      ...(query.type && { type: query.type }),
      ...(query.period && { createdAt: { gte: periodStart(query.period, new Date()) } }),
      ...(query.q && {
        AND: [
          {
            OR: NOTIFICATION_SEARCH_KEYS.map((key) => ({
              data: { path: [key], string_contains: query.q, mode: "insensitive" as const },
            })),
          },
        ],
      }),
    }
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { ...mine, ...after, ...filters },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: SELECT,
      }),
      prisma.notification.count({ where: { ...mine, readAt: null } }),
    ])
    const items = rows.slice(0, query.limit)
    const last = items.at(-1)
    const nextCursor = rows.length > query.limit && last ? encodeNotificationCursor(last) : null
    return c.json({ items, nextCursor, unreadCount })
  })

  /** The badge on the Inbox tab, read when the stream below is down. */
  .get("/unread-count", async (c) => {
    return c.json({ count: await unreadCount(c.get("organizationId"), c.get("user").id) })
  })

  /**
   * The badge, pushed (ADR 0057): a `count` event `{ count }` on open and after each change to
   * the user's notifications in this workspace. Ends after `STREAM_LIFETIME_MS`; EventSource
   * reconnects.
   */
  .get("/stream", (c) => {
    const organizationId = c.get("organizationId")
    const userId = c.get("user").id
    let timer: ReturnType<typeof setTimeout> | undefined
    let send = () => {}
    const unsubscribe = subscribeToNotifications(organizationId, userId, () => {
      clearTimeout(timer)
      timer = setTimeout(() => send(), STREAM_DEBOUNCE_MS)
    })
    if (!unsubscribe) return c.json({ error: "too_many_streams" }, 429)
    // Bun closes a connection idle for 10 s; Hono on Bun passes the server as `env`.
    const server = c.env as { timeout?: (req: Request, seconds: number) => void } | undefined
    server?.timeout?.(c.req.raw, 0)
    const res = streamSSE(c, async (stream) => {
      let wake = () => {}
      const ended = new Promise<void>((resolve) => {
        wake = resolve
      })
      stream.onAbort(() => wake())
      // One query at a time, in order, so an older count never lands after a newer one.
      let sending = Promise.resolve()
      send = () => {
        sending = sending
          .then(async () => {
            const count = await unreadCount(organizationId, userId)
            await stream.writeSSE({ event: "count", data: JSON.stringify({ count }) })
          })
          .catch(() => {})
      }
      try {
        send()
        const deadline = Date.now() + STREAM_LIFETIME_MS
        while (!stream.aborted && Date.now() < deadline) {
          const wait = Math.min(STREAM_HEARTBEAT_MS, deadline - Date.now())
          await Promise.race([stream.sleep(wait), ended])
          if (!stream.aborted) await stream.write(": ping\n\n")
        }
      } finally {
        unsubscribe()
        clearTimeout(timer)
        send = () => {}
        await sending
      }
    })
    // `no-transform` keeps compressing proxies (Next's among them) from buffering the stream. Set
    // on both: Hono copies headers already set on the context over the returned response.
    for (const [name, value] of [
      ["Cache-Control", "no-cache, no-transform"],
      ["X-Accel-Buffering", "no"],
    ] as const) {
      res.headers.set(name, value)
      c.header(name, value)
    }
    return res
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
    if (count > 0) await signalNotifications(prisma, c.get("organizationId"), [c.get("user").id])
    return c.json({ updated: count })
  })

  /** Back to unread (the Inbox's "Mark unread"). Ids that aren't yours are ignored. */
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
    if (count > 0) await signalNotifications(prisma, c.get("organizationId"), [c.get("user").id])
    return c.json({ updated: count })
  })

  /** Deletes your notifications (the Inbox's "Dismiss" and "Clear read"). Others' ids are ignored. */
  .post("/dismiss", async (c) => {
    const { ids } = await parseJson(c, NotificationIdsSchema)
    const { count } = await prisma.notification.deleteMany({
      where: forOrganization(c.get("organizationId")).notification({
        userId: c.get("user").id,
        id: { in: ids },
      }),
    })
    if (count > 0) await signalNotifications(prisma, c.get("organizationId"), [c.get("user").id])
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
