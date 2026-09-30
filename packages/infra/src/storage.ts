import {
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
 *   org/{orgId}/envelopes/{envelopeId}/fields/{fieldId}.png
 *   org/{orgId}/envelopes/{envelopeId}/signed.pdf
 *   org/{orgId}/envelopes/{envelopeId}/certificate.pdf
 *   org/{orgId}/exports/{exportId}.zip
 */
export const keys = {
  original: (orgId: string, documentId: string) =>
    `org/${orgId}/documents/${documentId}/original.pdf`,
  fieldImage: (orgId: string, envelopeId: string, fieldId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/fields/${fieldId}.png`,
  signed: (orgId: string, envelopeId: string) => `org/${orgId}/envelopes/${envelopeId}/signed.pdf`,
  certificate: (orgId: string, envelopeId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/certificate.pdf`,
  export: (orgId: string, exportId: string) => `org/${orgId}/exports/${exportId}.zip`,
  /** Everything a workspace stores (deleted with the workspace). */
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
 * Refuses prefixes that aren't a workspace folder, so a bug can't empty the bucket.
 */
export async function deletePrefix(prefix: string): Promise<number> {
  if (!/^org\/[^/]+\/(.+\/)?$/.test(prefix))
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
