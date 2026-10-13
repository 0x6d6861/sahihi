import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getEnv } from "@sahihi/config"
import { contentDisposition } from "@sahihi/core"

/**
 * Private object storage. The bucket is NEVER public; clients only receive
 * short-lived presigned URLs. Key layout (docs/architecture.md → Storage):
 *   org/{orgId}/documents/{documentId}/original.pdf
 *   org/{orgId}/documents/{documentId}/thumbnail.png
 *   org/{orgId}/envelopes/{envelopeId}/fields/{fieldId}.png
 *   org/{orgId}/envelopes/{envelopeId}/signed.pdf            (single-document, before ADR 0037)
 *   org/{orgId}/envelopes/{envelopeId}/signed/{envelopeDocumentId}.pdf
 *   org/{orgId}/envelopes/{envelopeId}/attachments/{attachmentId}
 *   org/{orgId}/envelopes/{envelopeId}/bundle.zip
 *   org/{orgId}/templates/{templateId}/attachments/{attachmentId}
 *   org/{orgId}/envelopes/{envelopeId}/certificate.pdf
 *   org/{orgId}/exports/{exportId}.zip
 *   org/{orgId}/branding/logo-{version}.png
 *   user/{userId}/{signature|initials}-{version}.png
 *   user/{userId}/avatar-{version}.png
 */
export const keys = {
  original: (orgId: string, documentId: string) =>
    `org/${orgId}/documents/${documentId}/original.pdf`,
  /** First-page preview for the Documents grid (ADR 0033). Same access rules as the original. */
  thumbnail: (orgId: string, documentId: string) =>
    `org/${orgId}/documents/${documentId}/thumbnail.png`,
  fieldImage: (orgId: string, envelopeId: string, fieldId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/fields/${fieldId}.png`,
  /** Single-document envelopes signed before ADR 0037 keep this key. */
  signed: (orgId: string, envelopeId: string) => `org/${orgId}/envelopes/${envelopeId}/signed.pdf`,
  /** One signed PDF per envelope document (ADR 0037). */
  signedDocument: (orgId: string, envelopeId: string, envelopeDocumentId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/signed/${envelopeDocumentId}.pdf`,
  /** A supporting file shared with the recipients (ADR 0037); always served as a download. */
  attachment: (orgId: string, envelopeId: string, attachmentId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/attachments/${attachmentId}`,
  /** "Download all": signed PDFs, certificate and supporting files (ADR 0037). */
  bundle: (orgId: string, envelopeId: string) => `org/${orgId}/envelopes/${envelopeId}/bundle.zip`,
  /** A template's own copy of a supporting file (ADR 0037). */
  templateAttachment: (orgId: string, templateId: string, attachmentId: string) =>
    `org/${orgId}/templates/${templateId}/attachments/${attachmentId}`,
  certificate: (orgId: string, envelopeId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/certificate.pdf`,
  export: (orgId: string, exportId: string) => `org/${orgId}/exports/${exportId}.zip`,
  /** Workspace logo (Settings → Workspace), served publicly by /api/branding. */
  logo: (orgId: string, version: string) => `org/${orgId}/branding/logo-${version}.png`,
  /** A user's saved signature or initials (Settings → Profile). Not workspace data. */
  savedSignature: (userId: string, kind: "signature" | "initials", version: string) =>
    `user/${userId}/${kind}-${version}.png`,
  /** A user's profile picture (Settings → Profile), served by /api/avatars. */
  avatar: (userId: string, version: string) => `user/${userId}/avatar-${version}.png`,
  /** Everything stored for one user (deleted with their account, ADR 0040). */
  userPrefix: (userId: string) => `user/${userId}/`,
  /** Everything a workspace stores (deleted with the workspace). */
  orgPrefix: (orgId: string) => `org/${orgId}/`,
  /** Everything stored for one envelope (signed PDF, certificate, signature images). */
  envelopePrefix: (orgId: string, envelopeId: string) => `org/${orgId}/envelopes/${envelopeId}/`,
}

/** A stored object's size and type, or null when it doesn't exist. */
export type ObjectInfo = { sizeBytes: number; contentType: string | null }

/**
 * One storage backend. Every backend can read and write; only Sahihi's own bucket can delete
 * (`DeletableStorage`), because Sahihi never deletes in a customer's bucket (ADR 0051). Workspace
 * files are deleted through `releaseObject` / `releasePrefix`, never through a driver directly.
 */
export interface StorageDriver {
  presignUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresIn?: number,
  ): Promise<string>
  /**
   * Short-lived GET URL. `inline` for the PDF viewers; `attachment` for "Download" buttons (the
   * browser saves the file instead of opening it). File names may be any language (RFC 6266).
   */
  presignDownload(
    key: string,
    opts?: { fileName?: string; expiresIn?: number; disposition?: "inline" | "attachment" },
  ): Promise<string>
  /**
   * GET URL the browser can cache: signed at the start of the current window, so every request in
   * that window gets the same URL, and valid for two windows, so it outlives the `max-age` it asks
   * the browser to cache it for. For small images listed on every page view (document thumbnails),
   * not for originals or signed PDFs.
   */
  presignCacheable(key: string, now?: number): Promise<string>
  get(key: string): Promise<Uint8Array>
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  /** Uploads a stream of known length (large files, e.g. export archives) without buffering it. */
  putStream(
    key: string,
    body: NodeJS.ReadableStream,
    contentLength: number,
    contentType: string,
  ): Promise<void>
  /** Server-side copy within the backend (template ↔ envelope supporting files). */
  copy(fromKey: string, toKey: string): Promise<void>
  head(key: string): Promise<ObjectInfo | null>
}

export interface DeletableStorage extends StorageDriver {
  delete(key: string): Promise<void>
  /**
   * Deletes every object under `prefix` (1000 per request). Returns how many were deleted.
   * Refuses prefixes that aren't a workspace or user folder, so a bug can't empty the bucket.
   */
  deletePrefix(prefix: string): Promise<number>
}

const canDelete = (storage: StorageDriver): storage is DeletableStorage => "delete" in storage

/** Window for `presignCacheable`: URLs repeat within it, and live at most twice as long. */
export const CACHEABLE_URL_WINDOW_SECONDS = 15 * 60

/** An S3-compatible bucket. Deletion is only granted to Sahihi's own bucket (`platformStorage`). */
function s3Storage(s3: () => S3Client, bucket: () => string): DeletableStorage {
  return {
    async presignUpload(key, contentType, sizeBytes, expiresIn = 300) {
      return getSignedUrl(
        s3(),
        new PutObjectCommand({
          Bucket: bucket(),
          Key: key,
          ContentType: contentType,
          ContentLength: sizeBytes,
        }),
        { expiresIn },
      )
    },

    async presignDownload(key, opts = {}) {
      return getSignedUrl(
        s3(),
        new GetObjectCommand({
          Bucket: bucket(),
          Key: key,
          ResponseContentDisposition: opts.fileName
            ? contentDisposition(opts.fileName, opts.disposition ?? "inline")
            : undefined,
        }),
        { expiresIn: opts.expiresIn ?? 300 },
      )
    },

    async presignCacheable(key, now = Date.now()) {
      const windowMs = CACHEABLE_URL_WINDOW_SECONDS * 1000
      return getSignedUrl(
        s3(),
        new GetObjectCommand({
          Bucket: bucket(),
          Key: key,
          ResponseCacheControl: `private, max-age=${CACHEABLE_URL_WINDOW_SECONDS}`,
        }),
        {
          signingDate: new Date(Math.floor(now / windowMs) * windowMs),
          expiresIn: 2 * CACHEABLE_URL_WINDOW_SECONDS,
        },
      )
    },

    async get(key) {
      const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
      if (!res.Body) throw new Error(`Empty object: ${key}`)
      return res.Body.transformToByteArray()
    },

    async put(key, body, contentType) {
      await s3().send(
        new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
      )
    },

    async putStream(key, body, contentLength, contentType) {
      await s3().send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: key,
          Body: body as never,
          ContentLength: contentLength,
          ContentType: contentType,
        }),
      )
    },

    async copy(fromKey, toKey) {
      await s3().send(
        new CopyObjectCommand({
          Bucket: bucket(),
          Key: toKey,
          CopySource: `${bucket()}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
        }),
      )
    },

    async head(key) {
      try {
        const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
        return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null }
      } catch {
        return null
      }
    },

    async delete(key) {
      await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
    },

    async deletePrefix(prefix) {
      if (!/^(org|user)\/[^/]+\/(.+\/)?$/.test(prefix))
        throw new Error(`Refusing to delete prefix "${prefix}"`)
      let deleted = 0
      let token: string | undefined
      do {
        const page = await s3().send(
          new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
        )
        const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
        if (objects.length > 0) {
          await s3().send(
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

let client: S3Client | undefined
let platform: DeletableStorage | undefined

/** Sahihi's own private bucket (`S3_*` env). */
export function platformStorage(): DeletableStorage {
  platform ??= s3Storage(
    () => {
      if (client) return client
      const env = getEnv()
      client = new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      })
      return client
    },
    () => getEnv().S3_BUCKET,
  )
  return platform
}

/**
 * Where a workspace's files (`org/{orgId}/…`) live. Always Sahihi's bucket until workspaces can
 * connect their own (ADR 0051, roadmap P7).
 */
export async function storageFor(_orgId: string): Promise<StorageDriver> {
  return platformStorage()
}

/** Where a person's own files (`user/{userId}/…`) live: always Sahihi's bucket (ADR 0051). */
export function userStorage(): DeletableStorage {
  return platformStorage()
}

/** Why a workspace file stopped being used. Recorded for files Sahihi may not delete (ADR 0051). */
export type ReleaseReason =
  | "deleted" // a person deleted the document, attachment, template or logo it belongs to
  | "replaced" // a newer version took its place (logo)
  | "upload_rejected" // the upload failed validation
  | "upload_abandoned" // the upload never completed
  | "retention" // purged under the workspace's retention settings
  | "expired" // a download archive past its expiry (data exports)
  | "workspace_deleted"

/**
 * A workspace file is no longer needed. Sahihi's bucket deletes it; a customer's bucket keeps it
 * (ADR 0051: Sahihi never deletes there).
 */
export async function releaseObject(orgId: string, key: string, _reason: ReleaseReason) {
  const storage = await storageFor(orgId)
  if (canDelete(storage)) await storage.delete(key)
}

/** Like `releaseObject`, for everything under a workspace prefix. Returns how many were deleted. */
export async function releasePrefix(orgId: string, prefix: string, _reason: ReleaseReason) {
  if (!prefix.startsWith(keys.orgPrefix(orgId)))
    throw new Error(`Prefix "${prefix}" is outside workspace ${orgId}`)
  const storage = await storageFor(orgId)
  return canDelete(storage) ? storage.deletePrefix(prefix) : 0
}
