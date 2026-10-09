import {
  activityData,
  activityTypesFor,
  decodeActivityCursor,
  encodeActivityCursor,
  ListActivityQuerySchema,
  periodStart,
} from "@sahihi/core"
import { forOrganization, type Prisma, prisma } from "@sahihi/db"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { badRequest, parseQuery } from "../lib/http"
import { requireOrg } from "../middleware/session"

/**
 * The workspace activity feed of the Inbox (docs/notifications.md → Inbox, ADR 0041): audit events
 * of every envelope in the active workspace. Any member may read it, as any member may read one
 * envelope's audit trail. IP addresses, user agents, hashes and the rest of each event's data stay
 * on the envelope page (`activityData`).
 * The Inbox's search and chips narrow it: `group`, `actor` (a member), `period`, and `q` (envelope
 * title, recipient name or the acting member's name, any case).
 */
/** How many users a name search considers as actors. */
const ACTOR_SEARCH_LIMIT = 200

export const activity = new Hono<AppEnv>()
  .use(requireOrg)

  /**
   * Newest first, keyset-paginated by `cursor` (the previous page's `nextCursor`). The first page
   * also carries `people`, the workspace's members, for the People chip.
   */
  .get("/", async (c) => {
    const query = parseQuery(c, ListActivityQuerySchema)
    const organizationId = c.get("organizationId")
    let after: Prisma.AuditEventWhereInput = {}
    if (query.cursor) {
      const cursor = decodeActivityCursor(query.cursor)
      if (!cursor) badRequest("Invalid cursor")
      const { id, occurredAt } = cursor as NonNullable<typeof cursor>
      after = { OR: [{ occurredAt: { lt: occurredAt } }, { occurredAt, id: { lt: id } }] }
    }
    // Acting members by name, former ones included (audit rows outlive membership): users who are
    // members now or own an envelope here. Scoped so the cap never crowds out this workspace's actors.
    const namedActors = query.q
      ? await prisma.user.findMany({
          where: {
            name: { contains: query.q, mode: "insensitive" },
            OR: [
              { members: { some: { organizationId } } },
              { envelopes: { some: forOrganization(organizationId).envelope() } },
            ],
          },
          select: { id: true },
          take: ACTOR_SEARCH_LIMIT,
        })
      : []
    const rows = await prisma.auditEvent.findMany({
      where: {
        envelope: forOrganization(organizationId).envelope(),
        type: { in: activityTypesFor(query.group) },
        ...(query.actor && { actorUserId: query.actor }),
        ...(query.period && { occurredAt: { gte: periodStart(query.period, new Date()) } }),
        ...(query.q && {
          AND: [
            {
              OR: [
                { envelope: { title: { contains: query.q, mode: "insensitive" } } },
                { recipient: { name: { contains: query.q, mode: "insensitive" } } },
                ...(namedActors.length > 0
                  ? [{ actorUserId: { in: namedActors.map((u) => u.id) } }]
                  : []),
              ],
            },
          ],
        }),
        ...after,
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: {
        id: true,
        type: true,
        occurredAt: true,
        envelopeId: true,
        actorUserId: true,
        data: true,
        envelope: { select: { title: true } },
        recipient: { select: { name: true } },
      },
    })
    const page = rows.slice(0, query.limit)
    const actorIds = [...new Set(page.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])))]
    const [actors, people] = await Promise.all([
      actorIds.length
        ? prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true },
          })
        : [],
      query.cursor
        ? undefined
        : prisma.member
            .findMany({
              where: { organizationId },
              select: { user: { select: { id: true, name: true } } },
              orderBy: { user: { name: "asc" } },
            })
            .then((members) => members.map((m) => m.user)),
    ])
    const actorName = new Map(actors.map((a) => [a.id, a.name]))
    const items = page.map(({ envelope, recipient, actorUserId, data, ...event }) => ({
      ...event,
      // Only what the line quotes: no hashes, emails or storage keys (ADR 0041).
      data: activityData(data),
      envelopeTitle: envelope.title,
      recipientName: recipient?.name ?? null,
      actorName: actorUserId ? (actorName.get(actorUserId) ?? null) : null,
    }))
    const last = page.at(-1)
    const nextCursor = rows.length > query.limit && last ? encodeActivityCursor(last) : null
    return c.json({ items, nextCursor, ...(people && { people }) })
  })
