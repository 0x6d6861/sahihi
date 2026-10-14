import { S3Client } from "@aws-sdk/client-s3"
import { getEnv } from "@sahihi/config"
import { s3Bucket } from "./s3"
import type { DeletableStorage } from "./types"

let client: S3Client | undefined
let platform: DeletableStorage | undefined

/** The S3 client for Sahihi's own bucket (`S3_*` env). */
function platformClient() {
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

/** Sahihi's own private bucket. The only backend that can delete. */
export function platformStorage(): DeletableStorage {
  if (platform) return platform
  const bucket = s3Bucket(platformClient, () => getEnv().S3_BUCKET)
  platform = {
    kind: "platform",
    presignUpload: bucket.presignPut,
    uploaded: bucket.head,
    readUpload: bucket.get,
    async commitUpload() {
      // The browser uploaded straight to its final key.
    },
    discardUpload: bucket.delete,
    presignDownload: bucket.presignGet,
    presignCacheable: bucket.presignCacheable,
    get: bucket.get,
    getStream: bucket.getStream,
    put: bucket.put,
    putStream: bucket.putStream,
    copy: bucket.copy,
    head: bucket.head,
    delete: bucket.delete,
    async deletePrefix(prefix) {
      if (!/^(org|user)\/[^/]+\/(.+\/)?$/.test(prefix))
        throw new Error(`Refusing to delete prefix "${prefix}"`)
      return bucket.deleteAll(prefix)
    },
  }
  return platform
}

/** Raw access to Sahihi's bucket for staged uploads (keys.staging). */
export function platformBucket() {
  return s3Bucket(platformClient, () => getEnv().S3_BUCKET)
}
