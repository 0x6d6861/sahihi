import { canSyncStorage, type StorageReleaseReason } from "@sahihi/core"
import { getOrgPlan } from "./billing"
import type { Prisma, PrismaClient } from "./generated/prisma/client"
import { queueWorkspaceWebhook } from "./webhooks"

/** The fields infra needs to reach a connection's bucket (its `StorageConnectionConfig`). */
export const storageConnectionConfigSelect = {
  id: true,
  organizationId: true,
  provider: true,
  endpoint: true,
  region: true,
  bucket: true,
  prefix: true,
  forcePathStyle: true,
  auth: true,
  accessKeyId: true,
  secretEncrypted: true,
  roleArn: true,
  externalId: true,
  updatedAt: true,
} as const

/**
 * What `@sahihi/infra` storage needs from the database (docs/storage.md). Pass it to
 * `configureStorage` at startup in the api, the worker and test preloads.
 */
export function createStorageRegistry(prisma: PrismaClient) {
  return {
    primaryFor(orgId: string) {
      return prisma.storageConnection.findFirst({
        where: { organizationId: orgId, purpose: "PRIMARY", primaryState: { not: null } },
        select: { ...storageConnectionConfigSelect, primaryState: true },
      })
    },

    async recordRelease(input: {
      organizationId: string
      connectionId: string
      key: string
      reason: StorageReleaseReason
    }) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.storageRelease.create({ data: input })
        return queueWorkspaceWebhook(tx, {
          organizationId: input.organizationId,
          type: "storage.objects_released",
          data: {
            connectionId: input.connectionId,
            key: row.key,
            prefix: row.key.endsWith("/"),
            reason: row.reason,
            releasedAt: row.releasedAt.toISOString(),
          },
        })
      })
    },
  }
}

/**
 * Every object key the workspace's rows point at, in pages. A migration copies exactly these, so
 * files Sahihi no longer uses don't travel. `user/…` keys aren't workspace data and never move.
 */
export async function* referencedKeys(
  prisma: PrismaClient,
  organizationId: string,
  pageSize = 500,
) {
  const pages: ((
    cursor: string | undefined,
  ) => Promise<{ id: string; keys: (string | null)[] }[]>)[] = [
    async (cursor) =>
      (
        await prisma.document.findMany({
          where: { organizationId, status: "READY" },
          select: { id: true, s3Key: true, thumbnailKey: true },
          ...page(cursor, pageSize),
        })
      ).map((r) => ({ id: r.id, keys: [r.s3Key, r.thumbnailKey] })),
    async (cursor) =>
      (
        await prisma.envelope.findMany({
          where: { organizationId, purgedAt: null },
          select: {
            id: true,
            bundleS3Key: true,
            certificate: { select: { s3Key: true } },
            documents: { select: { signedS3Key: true } },
            attachments: { where: { status: "READY" }, select: { s3Key: true } },
            fields: { select: { imageS3Key: true } },
          },
          ...page(cursor, pageSize),
        })
      ).map((r) => ({
        id: r.id,
        keys: [
          r.bundleS3Key,
          r.certificate?.s3Key ?? null,
          ...r.documents.map((d) => d.signedS3Key),
          ...r.attachments.map((a) => a.s3Key),
          ...r.fields.map((f) => f.imageS3Key),
        ],
      })),
    async (cursor) =>
      (
        await prisma.templateAttachment.findMany({
          where: { template: { organizationId } },
          select: { id: true, s3Key: true },
          ...page(cursor, pageSize),
        })
      ).map((r) => ({ id: r.id, keys: [r.s3Key] })),
    async (cursor) =>
      (
        await prisma.dataExport.findMany({
          where: { organizationId, status: "READY", s3Key: { not: null } },
          select: { id: true, s3Key: true },
          ...page(cursor, pageSize),
        })
      ).map((r) => ({ id: r.id, keys: [r.s3Key] })),
    async (cursor) =>
      cursor
        ? []
        : (
            await prisma.workspaceSettings.findMany({
              where: { organizationId, logoKey: { not: null } },
              select: { organizationId: true, logoKey: true },
            })
          ).map((r) => ({ id: r.organizationId, keys: [r.logoKey] })),
  ]
  const prefix = `org/${organizationId}/`
  for (const next of pages) {
    let cursor: string | undefined
    for (;;) {
      const rows = await next(cursor)
      for (const row of rows) {
        for (const key of row.keys) if (key?.startsWith(prefix)) yield key
      }
      if (rows.length < pageSize) break
      cursor = rows[rows.length - 1]?.id
    }
  }
}

const page = (cursor: string | undefined, take: number) => ({
  orderBy: { id: "asc" as const },
  take,
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
})

/**
 * Sync outbox (docs/storage.md → Sync). Call inside the transaction that completes the envelope
 * (with its certificate), so a delivery exists if and only if the completion committed; enqueue
 * the returned ids with `enqueueStorageDeliveries` after it. Destinations that never passed a test
 * (PENDING), and workspaces whose plan no longer includes sync, get none.
 */
export async function queueStorageDeliveries(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; envelopeId: string },
): Promise<string[]> {
  if (!canSyncStorage(await getOrgPlan(tx, input.organizationId))) return []
  const destinations = await tx.storageConnection.findMany({
    where: {
      organizationId: input.organizationId,
      purpose: "SYNC",
      status: { in: ["ACTIVE", "FAILING"] },
    },
    select: { id: true },
  })
  const created = await Promise.all(
    destinations.map((d) =>
      tx.storageDelivery.upsert({
        where: { connectionId_envelopeId: { connectionId: d.id, envelopeId: input.envelopeId } },
        create: {
          organizationId: input.organizationId,
          connectionId: d.id,
          envelopeId: input.envelopeId,
        },
        update: {},
        select: { id: true },
      }),
    ),
  )
  return created.map((d) => d.id)
}
