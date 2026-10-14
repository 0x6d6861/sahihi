import { getEnv } from "@sahihi/config"
import { type StoragePrimaryState, type StorageTicket, signStorageTicket } from "@sahihi/core"
import type { CustomerBucket } from "./customer"
import { keys } from "./keys"
import { platformBucket, platformStorage } from "./platform"
import { CACHEABLE_URL_WINDOW_SECONDS } from "./s3"
import type { DeletableStorage, DownloadOptions, ObjectStream, StorageDriver } from "./types"

/** Where the API serves files from customer buckets (apps/api/src/routes/storage-objects.ts). */
export const STORAGE_OBJECTS_PATH = "/api/storage/objects"

/** A URL on our own origin that streams `key` (docs/storage.md → File access). */
export async function ticketUrl(ticket: StorageTicket): Promise<string> {
  const env = getEnv()
  const signed = await signStorageTicket(env.BETTER_AUTH_SECRET, ticket)
  return `${env.WEB_URL.replace(/\/$/, "")}${STORAGE_OBJECTS_PATH}/${signed}`
}

type Reader = Pick<StorageDriver, "get" | "head" | "getStream">

/** The first backend that has the object (`get` throws NoSuchKey on the last one). */
async function firstWith<T>(
  readers: Reader[],
  read: (r: Reader) => Promise<T | null>,
): Promise<T | null> {
  for (const r of readers) {
    const found = await read(r)
    if (found !== null) return found
  }
  return null
}

/**
 * A workspace whose files live in its own bucket (Enterprise, ADR 0051). While files move in
 * (MIGRATING_IN) new writes go to the customer and reads fall back to Sahihi's bucket; while they
 * move back out (MIGRATING_OUT) it's the other way round. The browser never talks to the customer's
 * bucket: uploads wait in Sahihi's bucket until they're validated, and downloads are tickets to our
 * own origin, so the CSP keeps one storage origin and the customer needs no CORS.
 */
export function primaryStorage(
  orgId: string,
  customer: CustomerBucket,
  state: StoragePrimaryState,
): StorageDriver {
  const platform: DeletableStorage = platformStorage()
  const staging = platformBucket()
  const customerReader: Reader = {
    get: customer.get,
    head: customer.head,
    getStream: customer.getStream,
  }
  const readers =
    state === "MIGRATING_IN"
      ? [customerReader, platform]
      : state === "MIGRATING_OUT"
        ? [platform, customerReader]
        : [customerReader]
  const writesToPlatform = state === "MIGRATING_OUT"

  const head = (key: string) => firstWith(readers, (r) => r.head(key))
  const getStream = (key: string): Promise<ObjectStream | null> =>
    firstWith(readers, (r) => r.getStream(key))
  async function get(key: string) {
    for (const [i, r] of readers.entries()) {
      if (i === readers.length - 1) return r.get(key)
      if (await r.head(key)) return r.get(key)
    }
    throw new Error(`No reader for ${key}`)
  }

  // Uploads land in staging, or (presigned before a migration started) at their final key.
  const uploadedAt = async (key: string) =>
    (await staging.head(keys.staging(key)))
      ? keys.staging(key)
      : (await platform.head(key))
        ? key
        : null

  return {
    kind: "customer",

    presignUpload: (key, contentType, sizeBytes, expiresIn) =>
      writesToPlatform
        ? platform.presignUpload(key, contentType, sizeBytes, expiresIn)
        : staging.presignPut(keys.staging(key), contentType, sizeBytes, expiresIn),

    async uploaded(key) {
      const at = await uploadedAt(key)
      return at ? staging.head(at) : null
    },

    async readUpload(key) {
      const at = await uploadedAt(key)
      if (!at) throw new Error(`Upload not found: ${key}`)
      return staging.get(at)
    },

    stageUpload: (key, bytes, contentType) =>
      writesToPlatform
        ? platform.put(key, bytes, contentType)
        : staging.put(keys.staging(key), bytes, contentType),

    async commitUpload(key, bytes, contentType) {
      if (writesToPlatform) {
        if (!(await platform.head(key))) await platform.put(key, bytes, contentType)
      } else {
        await customer.put(key, bytes, contentType)
      }
      // Sahihi's copy goes: the file now lives where the workspace keeps its files.
      if (await staging.head(keys.staging(key))) await staging.delete(keys.staging(key))
      if (!writesToPlatform && (await platform.head(key))) await platform.delete(key)
    },

    async discardUpload(key) {
      await staging.delete(keys.staging(key))
      if (await platform.head(key)) await platform.delete(key)
    },

    presignDownload: (key, opts: DownloadOptions = {}) =>
      ticketUrl({
        o: orgId,
        k: key,
        e: Math.floor(Date.now() / 1000) + (opts.expiresIn ?? 300),
        ...(opts.fileName && { f: opts.fileName }),
        d: opts.disposition === "attachment" ? "a" : "i",
      }),

    presignCacheable(key, now = Date.now()) {
      // Same window maths as Sahihi's presigned URLs, so the URL repeats and the browser caches.
      const windowSec = CACHEABLE_URL_WINDOW_SECONDS
      const start = Math.floor(now / 1000 / windowSec) * windowSec
      return ticketUrl({ o: orgId, k: key, e: start + 2 * windowSec, c: 1 })
    },

    get,
    getStream,
    head,

    async put(key, body, contentType) {
      if (writesToPlatform) await platform.put(key, body, contentType)
      else await customer.put(key, body, contentType)
    },

    async putStream(key, body, contentLength, contentType) {
      if (writesToPlatform) await platform.putStream(key, body, contentLength, contentType)
      else await customer.putStream(key, body, contentLength, contentType)
    },

    async copy(fromKey, toKey) {
      if (state === "ACTIVE") return customer.copy(fromKey, toKey)
      // Mid-migration the source may be on either side: copy through memory to the writer.
      const info = await head(fromKey)
      const bytes = await get(fromKey)
      const type = info?.contentType ?? "application/octet-stream"
      if (writesToPlatform) await platform.put(toKey, bytes, type)
      else await customer.put(toKey, bytes, type)
    },
  }
}
