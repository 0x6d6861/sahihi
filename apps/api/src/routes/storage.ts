import { getEnv } from "@sahihi/config"
import {
  awsExternalId,
  awsRoleTrustPolicy,
  CreateS3ConnectionSchema,
  canConnectStorage,
  checkStorageEndpoint,
  encryptSecret,
  hasPermission,
  resolveStorageEndpoint,
  STORAGE_PROVIDER_INFO,
  STORAGE_RELEASE_REASON_LABELS,
  StorageBackfillSchema,
  storageBucketPolicy,
  UpdateStorageConnectionSchema,
} from "@sahihi/core"
import { forOrganization, getOrgPlan, type Prisma, prisma } from "@sahihi/db"
import {
  awsRoleAccessConfigured,
  enqueueStorageDeliveries,
  enqueueStorageMigration,
  testStorageConnection,
} from "@sahihi/infra"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import type { AppEnv } from "../lib/env"
import { badRequest, conflict, forbidden, notFound, parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"
import { oauthProviders, storageOAuth, testOAuthConnection } from "./storage-oauth"

/**
 * The workspace's own storage (docs/storage.md, ADR 0051): sync destinations (Business and up)
 * and primary storage (Enterprise). Owners and admins only (`data:manage`): a connection sends
 * the workspace's files somewhere else. Secrets are write-only.
 */

const requireStorageManager = createMiddleware<AppEnv>(async (c, next) => {
  if (!hasPermission(c.get("memberRole"), { data: ["manage"] })) {
    forbidden("Only owners and admins can manage storage")
  }
  await next()
})

const connectionSelect = {
  id: true,
  purpose: true,
  provider: true,
  name: true,
  endpoint: true,
  region: true,
  bucket: true,
  prefix: true,
  auth: true,
  secretHint: true,
  roleArn: true,
  externalId: true,
  accountEmail: true,
  rootFolder: true,
  folderTemplate: true,
  status: true,
  primaryState: true,
  migratedCount: true,
  migrateTotal: true,
  lastCheckedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} as const

const deliverySelect = {
  id: true,
  status: true,
  attempts: true,
  lastAttemptAt: true,
  lastError: true,
  path: true,
  fileCount: true,
  deliveredAt: true,
  createdAt: true,
  envelope: { select: { id: true, title: true } },
} as const

/** Everything infra needs to reach the bucket, including the encrypted secret (never returned). */
const configSelect = {
  ...connectionSelect,
  organizationId: true,
  forcePathStyle: true,
  accessKeyId: true,
  secretEncrypted: true,
} as const

type ConnectionRow = Prisma.StorageConnectionGetPayload<{ select: typeof configSelect }>

const view = ({
  organizationId: _o,
  accessKeyId: _a,
  secretEncrypted: _s,
  forcePathStyle: _f,
  ...c
}: ConnectionRow) => c

function planRequired(message: string): never {
  throw new HTTPException(402, {
    res: Response.json({ error: "plan_required", message }, { status: 402 }),
  })
}

async function loadConnection(orgId: string, id: string) {
  const row = await prisma.storageConnection.findFirst({
    where: forOrganization(orgId).storageConnection({ id }),
    select: configSelect,
  })
  if (!row) notFound("Storage connection")
  return row
}

/** Runs "Test connection" and records the outcome on the row. */
async function check(row: ConnectionRow) {
  const result = await testStorageConnection(row)
  const updated = await prisma.storageConnection.update({
    where: { id: row.id },
    data: {
      lastCheckedAt: new Date(),
      lastError: result.ok ? null : result.message,
      // A new connection stays PENDING until it passes once; after that a failure is FAILING.
      status: result.ok ? "ACTIVE" : row.status === "PENDING" ? "PENDING" : "FAILING",
    },
    select: configSelect,
  })
  return { connection: view(updated), test: result }
}

/** Serialises connection changes per workspace (at most one PRIMARY, destination limits). */
async function lockStorage(tx: Prisma.TransactionClient, orgId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`storage:${orgId}`}))`
}

async function countConnections(db: Prisma.TransactionClient, orgId: string) {
  const rows = await db.storageConnection.groupBy({
    by: ["purpose"],
    where: { organizationId: orgId },
    _count: true,
  })
  const count = (p: string) => rows.find((r) => r.purpose === p)?._count ?? 0
  return { sync: count("SYNC"), primary: count("PRIMARY") }
}

export const storage = new Hono<AppEnv>()
  .use(requireOrg)
  .use(requireStorageManager)

  /** The settings page: plan, connections, recent deliveries, how to set up an IAM role. */
  .get("/", async (c) => {
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const env = getEnv()
    const [plan, connections, releases] = await Promise.all([
      getOrgPlan(prisma, orgId),
      prisma.storageConnection.findMany({
        where: scope.storageConnection(),
        orderBy: { createdAt: "asc" },
        select: {
          ...connectionSelect,
          deliveries: { select: deliverySelect, orderBy: { createdAt: "desc" }, take: 10 },
        },
      }),
      prisma.storageRelease.count({ where: scope.storageRelease() }),
    ])
    const roleAccess = awsRoleAccessConfigured()
    return c.json({
      plan: {
        id: plan.id,
        name: plan.name,
        ownStorage: plan.ownStorage,
        storageDestinations: plan.storageDestinations,
      },
      connections,
      releasedCount: releases,
      awsRole: roleAccess
        ? {
            accountId: env.STORAGE_AWS_ACCOUNT_ID,
            externalId: await awsExternalId(env.BETTER_AUTH_SECRET, orgId),
          }
        : null,
      oauth: oauthProviders(),
    })
  })

  /** The IAM policies to paste into AWS for this bucket and prefix (the form shows them). */
  .get("/aws-policies", async (c) => {
    const env = getEnv()
    if (!awsRoleAccessConfigured()) notFound("IAM role access")
    const bucket = c.req.query("bucket")?.trim() || "your-bucket"
    const prefix = (c.req.query("prefix") ?? "").replace(/^\/+|\/+$/g, "")
    const externalId = await awsExternalId(env.BETTER_AUTH_SECRET, c.get("organizationId"))
    return c.json({
      externalId,
      trustPolicy: awsRoleTrustPolicy(env.STORAGE_AWS_ACCOUNT_ID as string, externalId),
      permissionsPolicy: storageBucketPolicy(bucket, prefix ? `${prefix}/` : "", { tagging: true }),
    })
  })

  /** Connect an S3-compatible bucket. Tested straight away; saved even if the test fails. */
  .post("/connections", async (c) => {
    const input = await parseJson(c, CreateS3ConnectionSchema)
    const orgId = c.get("organizationId")
    const env = getEnv()
    const info = STORAGE_PROVIDER_INFO[input.provider]
    if (input.purpose === "PRIMARY" && !info.supportsPrimary) {
      badRequest(`${info.label} can't hold primary storage`)
    }
    if (input.auth === "AWS_ROLE" && !awsRoleAccessConfigured()) {
      badRequest("IAM role access isn't available; use an access key")
    }
    const endpoint = resolveStorageEndpoint(input)
    if (endpoint) {
      const checked = checkStorageEndpoint(endpoint, {
        allowPrivate: env.STORAGE_ALLOW_PRIVATE_ENDPOINTS,
      })
      if (!checked.ok) {
        return c.json(
          { error: "validation_error", issues: [{ path: "endpoint", message: checked.message }] },
          400,
        )
      }
    }
    const plan = await getOrgPlan(prisma, orgId)
    const secret =
      input.auth === "ACCESS_KEYS"
        ? {
            accessKeyId: input.accessKeyId,
            secretEncrypted: await encryptSecret(env.BETTER_AUTH_SECRET, input.secretAccessKey),
            secretHint: input.accessKeyId.slice(-4),
          }
        : {
            roleArn: input.roleArn,
            externalId: await awsExternalId(env.BETTER_AUTH_SECRET, orgId),
          }
    const created = await prisma.$transaction(async (tx) => {
      await lockStorage(tx, orgId)
      const allowed = canConnectStorage(plan, input.purpose, await countConnections(tx, orgId))
      if (!allowed.ok) planRequired(allowed.message)
      return tx.storageConnection.create({
        data: {
          organizationId: orgId,
          createdById: c.get("user").id,
          purpose: input.purpose,
          provider: input.provider,
          name: input.name,
          endpoint,
          region: input.region,
          bucket: input.bucket,
          prefix: input.prefix,
          forcePathStyle: info.forcePathStyle,
          auth: input.auth,
          folderTemplate: input.folderTemplate,
          ...secret,
        },
        select: configSelect,
      })
    })
    return c.json(await check(created), 201)
  })

  .patch("/connections/:id", async (c) => {
    const input = await parseJson(c, UpdateStorageConnectionSchema)
    const row = await loadConnection(c.get("organizationId"), c.req.param("id"))
    const rotating = input.accessKeyId !== undefined && input.secretAccessKey !== undefined
    if (rotating && row.auth !== "ACCESS_KEYS") badRequest("This connection doesn't use keys")
    const updated = await prisma.storageConnection.update({
      where: { id: row.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.folderTemplate !== undefined && { folderTemplate: input.folderTemplate }),
        ...(rotating && {
          accessKeyId: input.accessKeyId,
          secretEncrypted: await encryptSecret(
            getEnv().BETTER_AUTH_SECRET,
            input.secretAccessKey as string,
          ),
          secretHint: (input.accessKeyId as string).slice(-4),
        }),
      },
      select: configSelect,
    })
    if (rotating) return c.json(await check(updated))
    return c.json({ connection: view(updated) })
  })

  .post("/connections/:id/test", async (c) => {
    const row = await loadConnection(c.get("organizationId"), c.req.param("id"))
    if (row.auth === "OAUTH") return c.json(await testOAuthConnection(row))
    return c.json(await check(row))
  })

  /**
   * Primary storage: start keeping the workspace's files in this bucket. Existing files are
   * copied in the background; new files go there straight away.
   */
  .post("/connections/:id/activate", async (c) => {
    const orgId = c.get("organizationId")
    const row = await loadConnection(orgId, c.req.param("id"))
    if (row.purpose !== "PRIMARY") badRequest("Only primary storage is activated")
    if (row.primaryState) conflict("This storage is already in use")
    if (row.status !== "ACTIVE") conflict("Test the connection successfully first")
    const plan = await getOrgPlan(prisma, orgId)
    if (plan.ownStorage !== "primary") planRequired("Primary storage needs the Enterprise plan.")
    const updated = await prisma.storageConnection.update({
      where: { id: row.id },
      data: { primaryState: "MIGRATING_IN", migratedCount: 0, migrateTotal: 0 },
      select: configSelect,
    })
    await enqueueStorageMigration(row.id, "in")
    return c.json({ connection: view(updated) }, 202)
  })

  /** Restart a migration that stopped (its progress is kept: copied files are skipped). */
  .post("/connections/:id/migration/retry", async (c) => {
    const row = await loadConnection(c.get("organizationId"), c.req.param("id"))
    if (row.primaryState !== "MIGRATING_IN" && row.primaryState !== "MIGRATING_OUT") {
      conflict("No migration is running")
    }
    await enqueueStorageMigration(row.id, row.primaryState === "MIGRATING_IN" ? "in" : "out")
    return c.json({ connection: view(row) }, 202)
  })

  /**
   * Disconnect. Sync destinations go at once (their files stay). Primary storage in use first
   * copies the workspace's files back to Sahihi, then disconnects; nothing in the bucket is deleted.
   */
  .delete("/connections/:id", async (c) => {
    const row = await loadConnection(c.get("organizationId"), c.req.param("id"))
    if (row.purpose === "PRIMARY" && row.primaryState) {
      if (row.primaryState === "MIGRATING_OUT") conflict("Already disconnecting")
      const updated = await prisma.storageConnection.update({
        where: { id: row.id },
        data: { primaryState: "MIGRATING_OUT", migratedCount: 0, migrateTotal: 0 },
        select: configSelect,
      })
      await enqueueStorageMigration(row.id, "out")
      return c.json({ connection: view(updated) }, 202)
    }
    await prisma.storageConnection.delete({ where: { id: row.id } })
    return c.body(null, 204)
  })

  .get("/connections/:id/deliveries", async (c) => {
    const orgId = c.get("organizationId")
    const row = await loadConnection(orgId, c.req.param("id"))
    const cursor = c.req.query("cursor")
    const items = await prisma.storageDelivery.findMany({
      where: forOrganization(orgId).storageDelivery({ connectionId: row.id }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: deliverySelect,
    })
    return c.json({
      items: items.slice(0, 50),
      nextCursor: items.length > 50 ? (items[49]?.id ?? null) : null,
    })
  })

  .post("/connections/:id/deliveries/:deliveryId/retry", async (c) => {
    const orgId = c.get("organizationId")
    const delivery = await prisma.storageDelivery.findFirst({
      where: forOrganization(orgId).storageDelivery({
        id: c.req.param("deliveryId"),
        connectionId: c.req.param("id"),
      }),
      select: { id: true, status: true },
    })
    if (!delivery) notFound("Delivery")
    if (delivery.status !== "FAILED") badRequest("Only failed deliveries can be retried")
    const updated = await prisma.storageDelivery.update({
      where: { id: delivery.id },
      data: { status: "PENDING", attempts: 0 },
      select: deliverySelect,
    })
    await enqueueStorageDeliveries([delivery.id], { retryKey: String(Date.now()) })
    return c.json({ delivery: updated }, 202)
  })

  /** Retry every failed delivery to this destination. */
  .post("/connections/:id/retry-failed", async (c) => {
    const orgId = c.get("organizationId")
    const row = await loadConnection(orgId, c.req.param("id"))
    const failed = await prisma.storageDelivery.findMany({
      where: forOrganization(orgId).storageDelivery({ connectionId: row.id, status: "FAILED" }),
      select: { id: true },
      take: 1000,
    })
    const ids = failed.map((d) => d.id)
    await prisma.storageDelivery.updateMany({
      where: { id: { in: ids } },
      data: { status: "PENDING", attempts: 0 },
    })
    await enqueueStorageDeliveries(ids, { retryKey: String(Date.now()) })
    return c.json({ retried: ids.length }, 202)
  })

  /** Copy envelopes completed in the last `days` days (up to 1000) to a sync destination. */
  .post("/connections/:id/backfill", async (c) => {
    const input = await parseJson(c, StorageBackfillSchema)
    const orgId = c.get("organizationId")
    const row = await loadConnection(orgId, c.req.param("id"))
    if (row.purpose !== "SYNC") badRequest("Only sync destinations are backfilled")
    if (row.status === "PENDING") conflict("Test the connection successfully first")
    const since = new Date(Date.now() - input.days * 24 * 3600 * 1000)
    const envelopes = await prisma.envelope.findMany({
      where: forOrganization(orgId).envelope({
        status: "COMPLETED",
        purgedAt: null,
        completedAt: { gte: since },
        certificate: { isNot: null },
        storageDeliveries: { none: { connectionId: row.id } },
      }),
      select: { id: true },
      orderBy: { completedAt: "desc" },
      take: 1000,
    })
    await prisma.storageDelivery.createMany({
      data: envelopes.map((e) => ({
        organizationId: orgId,
        connectionId: row.id,
        envelopeId: e.id,
      })),
      skipDuplicates: true,
    })
    const created = await prisma.storageDelivery.findMany({
      where: { connectionId: row.id, envelopeId: { in: envelopes.map((e) => e.id) }, attempts: 0 },
      select: { id: true },
    })
    await enqueueStorageDeliveries(created.map((d) => d.id))
    return c.json({ queued: created.length }, 202)
  })

  /** Files in the workspace's own bucket that Sahihi no longer uses (newest first). */
  .get("/releases", async (c) => {
    const orgId = c.get("organizationId")
    const cursor = c.req.query("cursor")
    const items = await prisma.storageRelease.findMany({
      where: forOrganization(orgId).storageRelease(),
      orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: { id: true, key: true, reason: true, releasedAt: true, connectionId: true },
    })
    return c.json({
      items: items.slice(0, 50),
      nextCursor: items.length > 50 ? (items[49]?.id ?? null) : null,
    })
  })

  /** The whole released-files log as CSV, for a cleanup script. */
  .get("/releases.csv", async (c) => {
    const rows = await prisma.storageRelease.findMany({
      where: forOrganization(c.get("organizationId")).storageRelease(),
      orderBy: { releasedAt: "asc" },
      select: { key: true, reason: true, releasedAt: true },
      take: 100_000,
    })
    const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const lines = [
      "key,is_prefix,reason,reason_label,released_at",
      ...rows.map((r) =>
        [
          cell(r.key),
          r.key.endsWith("/") ? "true" : "false",
          r.reason,
          cell(STORAGE_RELEASE_REASON_LABELS[r.reason]),
          r.releasedAt.toISOString(),
        ].join(","),
      ),
    ]
    c.header("Content-Type", "text/csv; charset=utf-8")
    c.header("Content-Disposition", 'attachment; filename="sahihi-released-files.csv"')
    return c.body(`${lines.join("\n")}\n`)
  })

  .route("/oauth", storageOAuth)
