import { hasPermission, RetentionSettingsSchema } from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { getQueues, presignDownload } from "@sahihi/infra"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../lib/env"
import { conflict, forbidden, notFound, parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"

/**
 * Workspace data (docs/data-retention.md): retention settings and exports. Owners and admins
 * only (`data:manage`), because exports contain every envelope's personal data.
 */

const requireDataManager = createMiddleware<AppEnv>(async (c, next) => {
  if (!hasPermission(c.get("memberRole"), { data: ["manage"] })) {
    forbidden("Only owners and admins can manage workspace data")
  }
  await next()
})

const exportSelect = {
  id: true,
  status: true,
  sizeBytes: true,
  envelopeCount: true,
  error: true,
  createdAt: true,
  completedAt: true,
  expiresAt: true,
  s3Key: true,
  requestedBy: { select: { name: true } },
} as const

/** Never expose storage keys; say whether the archive can still be downloaded. */
const present = ({
  s3Key,
  ...x
}: { s3Key: string | null; expiresAt: Date | null } & Record<string, unknown>) => ({
  ...x,
  downloadable: Boolean(s3Key) && (x.expiresAt === null || x.expiresAt > new Date()),
})

export const data = new Hono<AppEnv>()
  .use(requireOrg)
  .use(requireDataManager)

  .get("/settings", async (c) => {
    const settings = await prisma.workspaceSettings.findUnique({
      where: { organizationId: c.get("organizationId") },
      select: { retentionYears: true },
    })
    return c.json({ retentionYears: settings?.retentionYears ?? null })
  })

  .put("/settings", async (c) => {
    const { retentionYears } = await parseJson(c, RetentionSettingsSchema)
    const organizationId = c.get("organizationId")
    await prisma.workspaceSettings.upsert({
      where: { organizationId },
      create: { organizationId, retentionYears },
      update: { retentionYears },
    })
    return c.json({ retentionYears })
  })

  .get("/exports", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const rows = await prisma.dataExport.findMany({
      where: scope.dataExport(),
      orderBy: { createdAt: "desc" },
      take: 10,
      select: exportSelect,
    })
    return c.json({ items: rows.map(present) })
  })

  .post("/exports", async (c) => {
    const organizationId = c.get("organizationId")
    const running = await prisma.dataExport.count({
      where: { organizationId, status: "PENDING" },
    })
    if (running > 0) conflict("An export is already being prepared")
    const created = await prisma.dataExport.create({
      data: { organizationId, requestedById: c.get("user").id },
      select: exportSelect,
    })
    await getQueues().maintenance.add(
      "export.build",
      { exportId: created.id },
      { jobId: `export-${created.id}`, attempts: 2 },
    )
    return c.json({ export: present(created) }, 202)
  })

  .get("/exports/:id/download", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const x = await prisma.dataExport.findFirst({
      where: scope.dataExport({ id: c.req.param("id") }),
      select: { status: true, s3Key: true, expiresAt: true, createdAt: true },
    })
    if (!x) notFound("Export")
    if (x.status !== "READY" || !x.s3Key || (x.expiresAt && x.expiresAt <= new Date())) {
      conflict("This export isn't available")
    }
    const day = x.createdAt.toISOString().slice(0, 10)
    return c.json({
      url: await presignDownload(x.s3Key, {
        fileName: `sahihi-export-${day}.zip`,
        disposition: "attachment",
      }),
    })
  })
