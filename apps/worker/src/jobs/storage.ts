import {
  canSyncStorage,
  downloadFileName,
  numberedFileName,
  STORAGE_PROVIDER_INFO,
  signedDocumentFileName,
  syncFolderPath,
  verifyAuditChain,
} from "@sahihi/core"
import {
  getOrgPlan,
  notifyWorkspaceAdmins,
  prisma,
  queueWorkspaceWebhook,
  referencedKeys,
  storageConnectionConfigSelect,
  toChainedEvent,
} from "@sahihi/db"
import {
  createLogger,
  customerBucket,
  DriveError,
  describeStorageError,
  driveDestination,
  enqueueStorageDeliveries,
  enqueueStorageMigration,
  enqueueWebhookDeliveries,
  platformStorage,
  type StorageConnectionConfig,
  storageFor,
  testStorageConnection,
  WriteOnceError,
} from "@sahihi/infra"
import { UnrecoverableError } from "bullmq"

const log = createLogger("storage")

const connectionSelect = {
  ...storageConnectionConfigSelect,
  purpose: true,
  name: true,
  status: true,
  primaryState: true,
  folderTemplate: true,
  rootFolder: true,
} as const

/**
 * A connection stopped working: mark it FAILING and tell the workspace's admins, once per failure
 * (not again while it stays FAILING). Delivery failures also emit `storage.delivery_failed`.
 */
async function markFailing(
  conn: { id: string; organizationId: string; name: string; status: string },
  message: string,
  delivery?: { id: string; envelopeId: string },
) {
  const webhookIds = await prisma.$transaction(async (tx) => {
    await tx.storageConnection.update({
      where: { id: conn.id },
      data: { status: conn.status === "PENDING" ? "PENDING" : "FAILING", lastError: message },
    })
    if (conn.status === "ACTIVE") {
      await notifyWorkspaceAdmins(tx, {
        organizationId: conn.organizationId,
        type: "storage.failing",
        data: { storageName: conn.name, reason: message },
      })
    }
    if (!delivery) return []
    return queueWorkspaceWebhook(tx, {
      organizationId: conn.organizationId,
      type: "storage.delivery_failed",
      data: {
        connectionId: conn.id,
        connectionName: conn.name,
        deliveryId: delivery.id,
        envelopeId: delivery.envelopeId,
        error: message,
      },
    })
  })
  await enqueueWebhookDeliveries(webhookIds)
}

async function markWorking(conn: { id: string; status: string }) {
  if (conn.status === "ACTIVE") return
  await prisma.storageConnection.update({
    where: { id: conn.id },
    data: { status: "ACTIVE", lastError: null, lastCheckedAt: new Date() },
  })
}

type SyncFile = { name: string; contentType: string; bytes: () => Promise<Uint8Array> }

/** The files one completed envelope delivers: signed PDFs, certificate, audit trail, supporting files. */
async function envelopeFiles(envelopeId: string) {
  const e = await prisma.envelope.findUniqueOrThrow({
    where: { id: envelopeId },
    include: {
      documents: { orderBy: { order: "asc" }, include: { document: { select: { name: true } } } },
      attachments: { where: { status: "READY" }, orderBy: { order: "asc" } },
      certificate: true,
      auditEvents: { orderBy: { seq: "asc" } },
    },
  })
  if (e.status !== "COMPLETED" || e.purgedAt || !e.certificate || !e.completedAt) return null
  if (e.documents.some((d) => !d.signedS3Key)) return null
  const storage = await storageFor(e.organizationId)
  const files: SyncFile[] = []
  for (const [i, d] of e.documents.entries()) {
    files.push({
      name:
        e.documents.length === 1
          ? downloadFileName(e.title, "signed")
          : numberedFileName(i, signedDocumentFileName(d.document.name)),
      contentType: "application/pdf",
      bytes: () => storage.get(d.signedS3Key as string),
    })
  }
  const certificate = e.certificate
  files.push({
    name: downloadFileName(e.title, "certificate"),
    contentType: "application/pdf",
    bytes: () => storage.get(certificate.s3Key),
  })
  files.push({
    name: "audit-trail.json",
    contentType: "application/json",
    bytes: async () => {
      const events = e.auditEvents.map(toChainedEvent)
      const body = {
        envelope: { id: e.id, title: e.title, completedAt: e.completedAt },
        certificate: { code: certificate.code, sha256: certificate.sha256 },
        documents: e.documents.map((d) => ({
          name: d.document.name,
          signedSha256: d.signedSha256,
        })),
        verification: await verifyAuditChain(events),
        events,
      }
      return new TextEncoder().encode(`${JSON.stringify(body, null, 2)}\n`)
    },
  })
  for (const [i, a] of e.attachments.entries()) {
    files.push({
      name: `supporting-files/${numberedFileName(i, a.name)}`,
      contentType: a.contentType || "application/octet-stream",
      bytes: () => storage.get(a.s3Key),
    })
  }
  return { envelope: { id: e.id, title: e.title, completedAt: e.completedAt }, files }
}

/**
 * Copies one completed envelope to one sync destination (docs/storage.md → Sync). Write-once:
 * files already there with the same bytes are skipped, so a retry finishes what a failed attempt
 * started. Throwing lets BullMQ retry; the last attempt marks the delivery FAILED.
 */
export async function deliverToStorage(deliveryId: string, attempt: { isFinal: boolean }) {
  const delivery = await prisma.storageDelivery.findUnique({
    where: { id: deliveryId },
    include: { connection: { select: connectionSelect } },
  })
  if (!delivery || delivery.status === "SUCCEEDED") return { skipped: true }
  const conn = delivery.connection

  const giveUp = async (message: string) => {
    await prisma.storageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: message,
      },
    })
    throw new UnrecoverableError(message)
  }

  if (!canSyncStorage(await getOrgPlan(prisma, delivery.organizationId))) {
    await giveUp("Paused: the workspace's plan doesn't include sync. Retry after upgrading.")
  }
  const source = await envelopeFiles(delivery.envelopeId)
  if (!source) await giveUp("The envelope's files are no longer available (purged or not final)")
  const { envelope, files } = source as NonNullable<typeof source>
  const folder = syncFolderPath(conn.folderTemplate, envelope)

  try {
    if (STORAGE_PROVIDER_INFO[conn.provider].kind === "s3") {
      const bucket = await customerBucket(conn as StorageConnectionConfig)
      for (const f of files) await bucket.put(`${folder}/${f.name}`, await f.bytes(), f.contentType)
    } else {
      const drive = await driveDestination(conn, {
        onRefreshToken: async (secretEncrypted) => {
          await prisma.storageConnection.update({
            where: { id: conn.id },
            data: { secretEncrypted },
          })
        },
      })
      for (const f of files) {
        const parts = `${folder}/${f.name}`.split("/")
        const name = parts.pop() as string
        await drive.write(parts, name, await f.bytes(), f.contentType)
      }
    }
  } catch (err) {
    const message =
      err instanceof DriveError || err instanceof WriteOnceError
        ? err.message
        : describeStorageError(err)
    await prisma.storageDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: message,
        ...(attempt.isFinal && { status: "FAILED" }),
      },
    })
    if (attempt.isFinal) await markFailing(conn, message, delivery)
    // A file with different bytes already there won't change by retrying.
    if (err instanceof WriteOnceError) {
      await prisma.storageDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED" },
      })
      throw new UnrecoverableError(message)
    }
    throw new Error(message)
  }

  await prisma.storageDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "SUCCEEDED",
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      lastError: null,
      deliveredAt: new Date(),
      path: folder,
      fileCount: files.length,
    },
  })
  await markWorking(conn)
  return { delivered: files.length, path: folder }
}

/**
 * Moves a workspace's files into its primary storage (MIGRATING_IN → ACTIVE) or back to Sahihi's
 * bucket (MIGRATING_OUT → disconnected). Copies exactly the keys the workspace's rows point at,
 * skipping those already there, in two passes so files written while the first pass ran aren't
 * missed. Moving in deletes Sahihi's copies at the end; moving out deletes nothing in the bucket.
 */
export async function migrateStorage(connectionId: string) {
  const conn = await prisma.storageConnection.findUnique({
    where: { id: connectionId },
    select: connectionSelect,
  })
  if (conn?.purpose !== "PRIMARY") return { skipped: true }
  if (conn.primaryState !== "MIGRATING_IN" && conn.primaryState !== "MIGRATING_OUT") {
    return { skipped: true }
  }
  const direction = conn.primaryState === "MIGRATING_IN" ? "in" : "out"
  const customer = await customerBucket(conn)
  const platform = platformStorage()

  let total = 0
  for await (const _ of referencedKeys(prisma, conn.organizationId)) total++
  await prisma.storageConnection.update({
    where: { id: conn.id },
    data: { migrateTotal: total, migratedCount: 0 },
  })

  let copied = 0
  let missing = 0
  for (const pass of [1, 2]) {
    let done = 0
    for await (const key of referencedKeys(prisma, conn.organizationId)) {
      const [from, to] = direction === "in" ? [platform, customer] : [customer, platform]
      if (!(await to.head(key))) {
        const info = await from.head(key)
        if (info) {
          const bytes = await from.get(key)
          await to.put(key, bytes, info.contentType ?? "application/octet-stream")
          copied++
        } else if (pass === 1) {
          // Purged by retention, or never written: nothing to move.
          missing++
        }
      }
      done++
      if (pass === 1 && done % 50 === 0) {
        await prisma.storageConnection.update({
          where: { id: conn.id },
          data: { migratedCount: done },
        })
      }
    }
  }

  if (direction === "in") {
    await prisma.storageConnection.update({
      where: { id: conn.id },
      data: { primaryState: "ACTIVE", migratedCount: total },
    })
    // Every file is in the customer's bucket now: Sahihi's copies go (they're ours to delete).
    const deleted = await platform.deletePrefix(`org/${conn.organizationId}/`)
    log.info("primary storage active", { connectionId, copied, missing, deleted })
    return { direction, copied, missing, deleted }
  }
  // Back in Sahihi's bucket. The connection goes; the customer's files stay where they are.
  await prisma.storageConnection.delete({ where: { id: conn.id } })
  log.info("primary storage disconnected", { connectionId, copied, missing })
  return { direction, copied, missing }
}

/** Every 6 hours: test each connection, so a revoked key is noticed before a delivery needs it. */
export async function checkStorageConnections() {
  const connections = await prisma.storageConnection.findMany({
    where: { status: { in: ["ACTIVE", "FAILING"] } },
    select: { ...connectionSelect, auth: true },
  })
  let failing = 0
  for (const conn of connections) {
    let result: { ok: true } | { ok: false; message: string }
    if (conn.auth === "OAUTH") {
      try {
        const drive = await driveDestination(conn, {
          onRefreshToken: async (secretEncrypted) => {
            await prisma.storageConnection.update({
              where: { id: conn.id },
              data: { secretEncrypted },
            })
          },
        })
        await drive.check()
        result = { ok: true }
      } catch (err) {
        result = {
          ok: false,
          message: err instanceof DriveError ? err.message : "The drive didn't answer",
        }
      }
    } else {
      result = await testStorageConnection(conn)
    }
    await prisma.storageConnection.update({
      where: { id: conn.id },
      data: { lastCheckedAt: new Date() },
    })
    if (result.ok) await markWorking(conn)
    else {
      failing++
      await markFailing(conn, result.message)
    }
  }
  return { checked: connections.length, failing }
}

/**
 * Outbox sweep: deliveries committed but never enqueued, and migrations whose job was lost (a
 * Redis restart). Job ids make re-enqueueing a queued one a no-op.
 */
export async function sweepStorageOutbox(olderThanMs = 2 * 60_000) {
  const stuck = await prisma.storageDelivery.findMany({
    where: {
      status: "PENDING",
      attempts: 0,
      createdAt: { lt: new Date(Date.now() - olderThanMs) },
    },
    select: { id: true },
    take: 1000,
  })
  await enqueueStorageDeliveries(stuck.map((d) => d.id))
  const migrating = await prisma.storageConnection.findMany({
    where: { primaryState: { in: ["MIGRATING_IN", "MIGRATING_OUT"] } },
    select: { id: true, primaryState: true },
  })
  for (const m of migrating) {
    await enqueueStorageMigration(m.id, m.primaryState === "MIGRATING_IN" ? "in" : "out").catch(
      () => {},
    )
  }
  return { enqueued: stuck.length, migrations: migrating.length }
}
