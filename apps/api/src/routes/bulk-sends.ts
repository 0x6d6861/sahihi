import { CreateBulkSendSchema } from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { startBulkSend } from "@sahihi/envelopes"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { clientMeta, notFound, parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"

/** Bulk sends (docs/bulk-send.md): start from a template, then follow progress row by row. */

export const bulkSendSelect = {
  id: true,
  title: true,
  status: true,
  total: true,
  sent: true,
  failed: true,
  createdAt: true,
  completedAt: true,
  template: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
} as const

/** Rows: outcome only (never the people: they're cleared after processing). */
export const bulkItemSelect = {
  row: true,
  status: true,
  envelopeId: true,
  error: true,
} as const

export const bulkSends = new Hono<AppEnv>()
  .use(requireOrg)

  .get("/", async (c) => {
    const items = await prisma.bulkSend.findMany({
      where: forOrganization(c.get("organizationId")).bulkSend(),
      orderBy: { createdAt: "desc" },
      take: 50,
      select: bulkSendSelect,
    })
    return c.json({ items })
  })

  .get("/:id", async (c) => {
    const bulk = await prisma.bulkSend.findFirst({
      where: forOrganization(c.get("organizationId")).bulkSend({ id: c.req.param("id") }),
      select: { ...bulkSendSelect, items: { select: bulkItemSelect, orderBy: { row: "asc" } } },
    })
    if (!bulk) notFound("Bulk send")
    return c.json({ bulkSend: bulk })
  })

/** POST /api/templates/:id/bulk-sends, mounted on the templates router. */
export const startBulkSendRoute = new Hono<AppEnv>().use(requireOrg).post("/", async (c) => {
  const data = await parseJson(c, CreateBulkSendSchema)
  const bulk = await startBulkSend({
    templateId: c.req.param("id") as string,
    organizationId: c.get("organizationId"),
    actor: { userId: c.get("user").id, ...clientMeta(c) },
    data,
  })
  return c.json({ bulkSend: { id: bulk.id, total: bulk.total, status: bulk.status } }, 202)
})
