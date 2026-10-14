import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectTaggingCommand,
  type S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { contentDisposition } from "@sahihi/core"
import type { DownloadOptions, ObjectInfo, ObjectStream } from "./types"

/** Window for cacheable URLs: they repeat within it, and live at most twice as long. */
export const CACHEABLE_URL_WINDOW_SECONDS = 15 * 60

const isMissing = (err: unknown) => {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404
}

/**
 * One S3-compatible bucket, with every key under `prefix`. The raw operations the drivers are
 * built from; nothing above this file talks to the S3 SDK.
 */
export function s3Bucket(client: () => S3Client, bucket: () => string, prefix = "") {
  const full = (key: string) => `${prefix}${key}`
  return {
    full,

    presignPut(key: string, contentType: string, sizeBytes: number, expiresIn = 300) {
      return getSignedUrl(
        client(),
        new PutObjectCommand({
          Bucket: bucket(),
          Key: full(key),
          ContentType: contentType,
          ContentLength: sizeBytes,
        }),
        { expiresIn },
      )
    },

    presignGet(key: string, opts: DownloadOptions = {}) {
      return getSignedUrl(
        client(),
        new GetObjectCommand({
          Bucket: bucket(),
          Key: full(key),
          ResponseContentDisposition: opts.fileName
            ? contentDisposition(opts.fileName, opts.disposition ?? "inline")
            : undefined,
        }),
        { expiresIn: opts.expiresIn ?? 300 },
      )
    },

    presignCacheable(key: string, now = Date.now()) {
      const windowMs = CACHEABLE_URL_WINDOW_SECONDS * 1000
      return getSignedUrl(
        client(),
        new GetObjectCommand({
          Bucket: bucket(),
          Key: full(key),
          ResponseCacheControl: `private, max-age=${CACHEABLE_URL_WINDOW_SECONDS}`,
        }),
        {
          signingDate: new Date(Math.floor(now / windowMs) * windowMs),
          expiresIn: 2 * CACHEABLE_URL_WINDOW_SECONDS,
        },
      )
    },

    async get(key: string): Promise<Uint8Array> {
      const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: full(key) }))
      if (!res.Body) throw new Error(`Empty object: ${key}`)
      return res.Body.transformToByteArray()
    },

    async getStream(key: string): Promise<ObjectStream | null> {
      try {
        const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: full(key) }))
        if (!res.Body) return null
        return {
          body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
          contentType: res.ContentType ?? null,
          sizeBytes: res.ContentLength ?? null,
        }
      } catch (err) {
        if (isMissing(err)) return null
        throw err
      }
    },

    async put(key: string, body: Uint8Array, contentType: string) {
      await client().send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: full(key),
          Body: body,
          ContentType: contentType,
        }),
      )
    },

    async putStream(
      key: string,
      body: NodeJS.ReadableStream,
      contentLength: number,
      contentType: string,
    ) {
      await client().send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: full(key),
          Body: body as never,
          ContentLength: contentLength,
          ContentType: contentType,
        }),
      )
    },

    async copy(fromKey: string, toKey: string) {
      await client().send(
        new CopyObjectCommand({
          Bucket: bucket(),
          Key: full(toKey),
          CopySource: `${bucket()}/${full(fromKey).split("/").map(encodeURIComponent).join("/")}`,
        }),
      )
    },

    /** Null when missing; other errors (permissions, network) throw. */
    async head(key: string): Promise<ObjectInfo | null> {
      try {
        const res = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: full(key) }))
        return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null }
      } catch (err) {
        if (isMissing(err)) return null
        throw err
      }
    },

    /** One page of keys under the prefix (connection checks). */
    async list(maxKeys = 1) {
      const res = await client().send(
        new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, MaxKeys: maxKeys }),
      )
      return (res.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : []))
    },

    async tag(key: string, tags: Record<string, string>) {
      await client().send(
        new PutObjectTaggingCommand({
          Bucket: bucket(),
          Key: full(key),
          Tagging: { TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) },
        }),
      )
    },

    // ── Sahihi's own bucket only (platform.ts). Customer drivers never get these. ──
    async delete(key: string) {
      await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: full(key) }))
    },

    async deleteAll(keyPrefix: string) {
      let deleted = 0
      let token: string | undefined
      do {
        const page = await client().send(
          new ListObjectsV2Command({
            Bucket: bucket(),
            Prefix: full(keyPrefix),
            ContinuationToken: token,
          }),
        )
        const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
        if (objects.length > 0) {
          await client().send(
            new DeleteObjectsCommand({
              Bucket: bucket(),
              Delete: { Objects: objects, Quiet: true },
            }),
          )
          deleted += objects.length
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return deleted
    },
  }
}

export type S3Bucket = ReturnType<typeof s3Bucket>
