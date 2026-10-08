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
  /** Everything a workspace stores (deleted with the workspace). */
  userPrefix: (userId: string) => `user/${userId}/`,
  orgPrefix: (orgId: string) => `org/${orgId}/`,
  /** Everything stored for one envelope (signed PDF, certificate, signature images). */
  envelopePrefix: (orgId: string, envelopeId: string) => `org/${orgId}/envelopes/${envelopeId}/`,
}

let client: S3Client | undefined
function s3() {
  if (client) return client
  const env = getEnv()
  client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  })
  return client
}
const bucket = () => getEnv().S3_BUCKET

export async function presignUpload(
  key: string,
  contentType: string,
  sizeBytes: number,
  expiresIn = 300,
) {
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
}

/**
 * Short-lived GET URL. `inline` for the PDF viewers; `attachment` for "Download" buttons (the
 * browser saves the file instead of opening it). File names may be any language (RFC 6266).
 */
export async function presignDownload(
  key: string,
  opts: { fileName?: string; expiresIn?: number; disposition?: "inline" | "attachment" } = {},
) {
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
}

/** Window for `presignCacheable`: URLs repeat within it, and live at most twice as long. */
export const CACHEABLE_URL_WINDOW_SECONDS = 15 * 60

/**
 * GET URL the browser can cache: signed at the start of the current window, so every request in
 * that window gets the same URL, and valid for two windows, so it outlives the `max-age` it asks
 * the browser to cache it for. For small images listed on every page view (document thumbnails),
 * not for originals or signed PDFs.
 */
export async function presignCacheable(key: string, now = Date.now()) {
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
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  if (!res.Body) throw new Error(`Empty object: ${key}`)
  return res.Body.transformToByteArray()
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  )
}

/** Uploads a stream of known length (large files, e.g. export archives) without buffering it. */
export async function putObjectStream(
  key: string,
  body: NodeJS.ReadableStream,
  contentLength: number,
  contentType: string,
) {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body as never,
      ContentLength: contentLength,
      ContentType: contentType,
    }),
  )
}

/** Server-side copy within the bucket (template ↔ envelope supporting files). */
export async function copyObject(fromKey: string, toKey: string) {
  await s3().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      Key: toKey,
      CopySource: `${bucket()}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
    }),
  )
}

export async function headObject(key: string) {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null }
  } catch {
    return null
  }
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

/**
 * Deletes every object under `prefix` (1000 per request). Returns how many were deleted.
 * Refuses prefixes that aren't a workspace or user folder, so a bug can't empty the bucket.
 */
export async function deletePrefix(prefix: string): Promise<number> {
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
        new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: objects, Quiet: true } }),
      )
      deleted += objects.length
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return deleted
}
