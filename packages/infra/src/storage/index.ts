import type { StoragePrimaryState, StorageReleaseReason } from "@sahihi/core"
import { enqueueWebhookDeliveries } from "../queues"
import { type CustomerBucket, customerBucket, type StorageConnectionConfig } from "./customer"
import { keys } from "./keys"
import { platformStorage } from "./platform"
import { primaryStorage } from "./primary"
import { canDelete, type DeletableStorage, type StorageDriver } from "./types"

export {
  assertPublicEndpoint,
  awsRoleAccessConfigured,
  type CustomerBucket,
  customerBucket,
  describeStorageError,
  type StorageConnectionConfig,
  StorageConnectionError,
  testStorageConnection,
} from "./customer"
export {
  type DriveDestination,
  DriveError,
  driveDestination,
  exchangeOAuthCode,
  type OAuthProvider,
  oauthAuthorizeUrl,
  oauthClient,
  oauthRedirectUri,
  oauthSlug,
} from "./drives"
export { documentUploadKey, keys, objectVersion } from "./keys"
export { platformStorage } from "./platform"
export { primaryStorage, STORAGE_OBJECTS_PATH, ticketUrl } from "./primary"
export { CACHEABLE_URL_WINDOW_SECONDS } from "./s3"
export {
  canDelete,
  type DeletableStorage,
  type DownloadOptions,
  type ObjectInfo,
  type ObjectStream,
  type StorageDriver,
  WriteOnceError,
} from "./types"

/**
 * What storage needs from the database, injected at startup (infra can't import @sahihi/db):
 * `configureStorage(storageRegistry)` in the api, the worker and test preloads.
 */
export interface StorageRegistry {
  /** The workspace's PRIMARY connection and its state, or null when its files are in Sahihi's bucket. */
  primaryFor(
    orgId: string,
  ): Promise<(StorageConnectionConfig & { primaryState: StoragePrimaryState | null }) | null>
  /** Logs a released file (or prefix) and returns webhook deliveries to enqueue. */
  recordRelease(input: {
    organizationId: string
    connectionId: string
    key: string
    reason: StorageReleaseReason
  }): Promise<string[]>
}

let registry: StorageRegistry | undefined

export function configureStorage(r: StorageRegistry) {
  registry = r
}

function requireRegistry(): StorageRegistry {
  if (!registry) {
    throw new Error("Storage isn't configured: call configureStorage(storageRegistry) at startup")
  }
  return registry
}

type Resolved =
  | { kind: "platform"; driver: DeletableStorage }
  | { kind: "customer"; driver: StorageDriver; bucket: CustomerBucket; connectionId: string }

async function resolve(orgId: string): Promise<Resolved> {
  const conn = await requireRegistry().primaryFor(orgId)
  if (!conn?.primaryState) return { kind: "platform", driver: platformStorage() }
  const bucket = await customerBucket(conn)
  return {
    kind: "customer",
    driver: primaryStorage(orgId, bucket, conn.primaryState),
    bucket,
    connectionId: conn.id,
  }
}

/**
 * Where a workspace's files (`org/{orgId}/…`) live: Sahihi's bucket, or the workspace's own when
 * it has primary storage (ADR 0051). Resolved on every call (one indexed query), so a migration
 * that starts is seen by the next request.
 */
export async function storageFor(orgId: string): Promise<StorageDriver> {
  return (await resolve(orgId)).driver
}

/** Where a person's own files (`user/{userId}/…`) live: always Sahihi's bucket (ADR 0051). */
export function userStorage(): DeletableStorage {
  return platformStorage()
}

/** Kept for call sites written before the reasons became an enum. */
export type ReleaseReason = StorageReleaseReason

/**
 * A workspace file is no longer needed. Sahihi's bucket deletes it. A customer's bucket keeps it:
 * Sahihi never deletes there (ADR 0051). The file is logged as released (Settings → Storage, the
 * `storage.objects_released` webhook) and tagged where the provider supports it. Any copy still in
 * Sahihi's bucket (mid-migration) is deleted, because that one is ours.
 */
export async function releaseObject(orgId: string, key: string, reason: StorageReleaseReason) {
  const resolved = await resolve(orgId)
  if (resolved.kind === "platform") return resolved.driver.delete(key)
  await platformStorage().delete(key)
  await resolved.bucket.tagReleased(key)
  const ids = await requireRegistry().recordRelease({
    organizationId: orgId,
    connectionId: resolved.connectionId,
    key: resolved.bucket.fullKey(key),
    reason,
  })
  await enqueueWebhookDeliveries(ids)
}

/** Like `releaseObject`, for everything under a workspace prefix. Returns how many Sahihi deleted. */
export async function releasePrefix(orgId: string, prefix: string, reason: StorageReleaseReason) {
  if (!prefix.startsWith(keys.orgPrefix(orgId)) || !prefix.endsWith("/"))
    throw new Error(`Prefix "${prefix}" is outside workspace ${orgId}`)
  const resolved = await resolve(orgId)
  const deleted = await platformStorage().deletePrefix(prefix)
  if (resolved.kind === "customer") {
    const ids = await requireRegistry().recordRelease({
      organizationId: orgId,
      connectionId: resolved.connectionId,
      key: resolved.bucket.fullKey(prefix),
      reason,
    })
    await enqueueWebhookDeliveries(ids)
  }
  return deleted
}

export { canDelete as isDeletable }
