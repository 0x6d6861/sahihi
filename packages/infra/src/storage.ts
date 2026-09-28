import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getEnv } from "@sahihi/config"

/**
 * Private object storage. The bucket is NEVER public; clients only receive
 * short-lived presigned URLs. Key layout (docs/architecture.md → Storage):
 *   org/{orgId}/documents/{documentId}/original.pdf
 *   org/{orgId}/envelopes/{envelopeId}/fields/{fieldId}.png
 *   org/{orgId}/envelopes/{envelopeId}/signed.pdf
 *   org/{orgId}/envelopes/{envelopeId}/certificate.pdf
 */
export const keys = {
  original: (orgId: string, documentId: string) =>
    `org/${orgId}/documents/${documentId}/original.pdf`,
  fieldImage: (orgId: string, envelopeId: string, fieldId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/fields/${fieldId}.png`,
  signed: (orgId: string, envelopeId: string) => `org/${orgId}/envelopes/${envelopeId}/signed.pdf`,
  certificate: (orgId: string, envelopeId: string) =>
    `org/${orgId}/envelopes/${envelopeId}/certificate.pdf`,
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

export async function presignDownload(
  key: string,
  opts: { fileName?: string; expiresIn?: number } = {},
) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: opts.fileName
        ? `inline; filename="${opts.fileName.replace(/["\\\r\n]/g, "_")}"`
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
