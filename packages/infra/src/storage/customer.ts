import { type LookupAddress, lookup as lookupCb } from "node:dns"
import { lookup } from "node:dns/promises"
import { Agent as HttpAgent } from "node:http"
import { Agent as HttpsAgent } from "node:https"
import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3"
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts"
import { getEnv } from "@sahihi/config"
import {
  checkStorageEndpoint,
  decryptSecret,
  isPrivateAddress,
  STORAGE_PROBE_KEY,
  STORAGE_PROVIDER_INFO,
  type StorageAuthMethod,
  type StorageProvider,
  sha256Hex,
} from "@sahihi/core"
import { type S3Bucket, s3Bucket } from "./s3"
import { type ObjectInfo, type ObjectStream, WriteOnceError } from "./types"

/** What infra needs from a saved `StorageConnection` row (docs/storage.md). */
export interface StorageConnectionConfig {
  id: string
  organizationId: string
  provider: StorageProvider
  endpoint: string | null
  region: string | null
  bucket: string | null
  prefix: string
  forcePathStyle: boolean
  auth: StorageAuthMethod
  accessKeyId: string | null
  secretEncrypted: string | null
  roleArn: string | null
  externalId: string | null
  updatedAt: Date
}

/**
 * A customer's bucket. Write-once and without delete (ADR 0051): `put` skips an object that's
 * already there with the same bytes and refuses one with different bytes; there is no way to
 * delete or overwrite. Keys are Sahihi's keys; the connection's prefix is added underneath.
 */
export interface CustomerBucket {
  readonly connectionId: string
  /** The object's full key in the bucket (prefix included), for the released-files log. */
  fullKey(key: string): string
  get(key: string): Promise<Uint8Array>
  getStream(key: string): Promise<ObjectStream | null>
  head(key: string): Promise<ObjectInfo | null>
  put(key: string, body: Uint8Array, contentType: string): Promise<"written" | "exists">
  putStream(
    key: string,
    body: NodeJS.ReadableStream,
    contentLength: number,
    contentType: string,
  ): Promise<void>
  copy(fromKey: string, toKey: string): Promise<void>
  /** Mark a released object for the customer's lifecycle rules, where the provider supports tags. */
  tagReleased(key: string): Promise<void>
}

/** Sahihi may assume customers' IAM roles only when all three are configured. */
export function awsRoleAccessConfigured() {
  const env = getEnv()
  return Boolean(
    env.STORAGE_AWS_ACCOUNT_ID &&
      env.STORAGE_AWS_ACCESS_KEY_ID &&
      env.STORAGE_AWS_SECRET_ACCESS_KEY,
  )
}

/** Refuses endpoints that are, or resolve to, private addresses (SSRF), unless allowed for dev. */
export async function assertPublicEndpoint(endpoint: string) {
  const allowPrivate = getEnv().STORAGE_ALLOW_PRIVATE_ENDPOINTS
  const checked = checkStorageEndpoint(endpoint, { allowPrivate })
  if (!checked.ok) throw new StorageConnectionError("endpoint", checked.message)
  if (allowPrivate) return
  const host = new URL(checked.url).hostname
  const addresses = await lookup(host, { all: true }).catch(() => [])
  if (addresses.length === 0) {
    throw new StorageConnectionError("endpoint", `Could not resolve ${host}`)
  }
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new StorageConnectionError("endpoint", "The endpoint resolves to a private address")
  }
}

/**
 * Agents that validate the address at connect time, so a hostname can't pass `assertPublicEndpoint`
 * and then resolve to a private address when the SDK connects (DNS rebinding).
 */
function guardedLookup(
  host: string,
  options: { all?: boolean; family?: number },
  cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void,
) {
  lookupCb(host, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, [])
    if (addresses.some((a) => isPrivateAddress(a.address))) {
      return cb(new Error("The endpoint resolves to a private address"), [])
    }
    if (options.all) return cb(null, addresses)
    const first = addresses[0]
    if (!first) return cb(new Error("No address found"), [])
    cb(null, first.address, first.family)
  })
}

function guardedAgents() {
  const opts = { lookup: guardedLookup as never, keepAlive: true }
  return { httpAgent: new HttpAgent(opts), httpsAgent: new HttpsAgent(opts) }
}

/** A connection problem the settings page can show as is (no secrets, no stack). */
export class StorageConnectionError extends Error {
  constructor(
    readonly step: "endpoint" | "credentials" | "write" | "read" | "list" | "config",
    message: string,
  ) {
    super(message)
    this.name = "StorageConnectionError"
  }
}

function roleCredentials(conn: StorageConnectionConfig) {
  const env = getEnv()
  if (!awsRoleAccessConfigured() || !conn.roleArn || !conn.externalId) {
    throw new StorageConnectionError("config", "IAM role access isn't available")
  }
  const sts = new STSClient({
    region: conn.region ?? "us-east-1",
    credentials: {
      accessKeyId: env.STORAGE_AWS_ACCESS_KEY_ID as string,
      secretAccessKey: env.STORAGE_AWS_SECRET_ACCESS_KEY as string,
    },
  })
  let cached: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
    expiration?: Date
  } | null = null
  return async () => {
    if (cached?.expiration && cached.expiration.getTime() - Date.now() > 5 * 60_000) return cached
    const res = await sts.send(
      new AssumeRoleCommand({
        RoleArn: conn.roleArn as string,
        ExternalId: conn.externalId as string,
        RoleSessionName: `sahihi-${conn.organizationId}`.slice(0, 64),
        DurationSeconds: 3600,
      }),
    )
    const c = res.Credentials
    if (!c?.AccessKeyId || !c.SecretAccessKey) {
      throw new StorageConnectionError("credentials", "AWS didn't return credentials for the role")
    }
    cached = {
      accessKeyId: c.AccessKeyId,
      secretAccessKey: c.SecretAccessKey,
      sessionToken: c.SessionToken,
      expiration: c.Expiration,
    }
    return cached
  }
}

async function customerClient(conn: StorageConnectionConfig): Promise<S3Client> {
  if (conn.endpoint) await assertPublicEndpoint(conn.endpoint)
  let credentials: S3ClientConfig["credentials"]
  if (conn.auth === "AWS_ROLE") credentials = roleCredentials(conn)
  else if (conn.auth === "ACCESS_KEYS" && conn.accessKeyId && conn.secretEncrypted) {
    credentials = {
      accessKeyId: conn.accessKeyId,
      secretAccessKey: await decryptSecret(getEnv().BETTER_AUTH_SECRET, conn.secretEncrypted),
    }
  } else throw new StorageConnectionError("config", "This connection has no S3 credentials")
  return new S3Client({
    region: conn.region ?? "us-east-1",
    endpoint: conn.endpoint ?? undefined,
    forcePathStyle: conn.forcePathStyle,
    credentials,
    // Several S3-compatible stores reject the CRC32 headers newer SDKs send by default.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
    ...(getEnv().STORAGE_ALLOW_PRIVATE_ENDPOINTS ? {} : { requestHandler: guardedAgents() }),
  })
}

/** Clients are cached per connection version, and rebuilt (endpoint re-checked) every 5 minutes. */
const clients = new Map<string, { client: S3Client; at: number }>()
const CLIENT_TTL_MS = 5 * 60_000

async function cachedClient(conn: StorageConnectionConfig) {
  const id = `${conn.id}:${conn.updatedAt.getTime()}`
  const hit = clients.get(id)
  if (hit && Date.now() - hit.at < CLIENT_TTL_MS) return hit.client
  const client = await customerClient(conn)
  for (const k of clients.keys()) if (k.startsWith(`${conn.id}:`)) clients.delete(k)
  clients.set(id, { client, at: Date.now() })
  return client
}

/** The customer's bucket behind a saved connection (S3-compatible providers only). */
export async function customerBucket(conn: StorageConnectionConfig): Promise<CustomerBucket> {
  if (!conn.bucket || STORAGE_PROVIDER_INFO[conn.provider].kind !== "s3") {
    throw new StorageConnectionError("config", "Not an S3-compatible connection")
  }
  const client = await cachedClient(conn)
  const raw = s3Bucket(
    () => client,
    () => conn.bucket as string,
    conn.prefix,
  )
  return writeOnce(conn, raw)
}

function writeOnce(conn: StorageConnectionConfig, raw: S3Bucket): CustomerBucket {
  return {
    connectionId: conn.id,
    fullKey: raw.full,
    get: raw.get,
    getStream: raw.getStream,
    head: raw.head,
    async put(key, body, contentType) {
      const existing = await raw.head(key)
      if (existing) {
        if (
          existing.sizeBytes === body.byteLength &&
          (await sha256Hex(await raw.get(key))) === (await sha256Hex(body))
        ) {
          return "exists"
        }
        throw new WriteOnceError(raw.full(key))
      }
      await raw.put(key, body, contentType)
      return "written"
    },
    async putStream(key, body, contentLength, contentType) {
      // Streams are versioned archives (exports, bundles): an existing key is never expected.
      if (await raw.head(key)) throw new WriteOnceError(raw.full(key))
      await raw.putStream(key, body, contentLength, contentType)
    },
    async copy(fromKey, toKey) {
      const existing = await raw.head(toKey)
      if (existing) {
        const source = await raw.head(fromKey)
        if (source && source.sizeBytes === existing.sizeBytes) return
        throw new WriteOnceError(raw.full(toKey))
      }
      await raw.copy(fromKey, toKey)
    },
    async tagReleased(key) {
      if (!STORAGE_PROVIDER_INFO[conn.provider].supportsTagging) return
      await raw.tag(key, { sahihi: "released" }).catch(() => {
        // Best effort: the released-files log is the record; tags only help lifecycle rules.
      })
    },
  }
}

/** Maps SDK errors to something a person can act on, without echoing provider internals. */
export function describeStorageError(err: unknown): string {
  if (err instanceof StorageConnectionError || err instanceof WriteOnceError) return err.message
  const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
  const status = e?.$metadata?.httpStatusCode
  switch (e?.name) {
    case "NoSuchBucket":
      return "The bucket doesn't exist (check its name and region)"
    case "InvalidAccessKeyId":
      return "The access key ID isn't recognised"
    case "SignatureDoesNotMatch":
      return "The secret access key doesn't match the access key ID"
    case "AccessDenied":
      return "Access denied: check the key's or role's permissions"
    case "PermanentRedirect":
    case "AuthorizationHeaderMalformed":
      return "The bucket is in a different region"
    case "TimeoutError":
      return "The storage didn't answer in time"
  }
  if (status === 403) return "Access denied: check the key's or role's permissions"
  if (status === 404) return "Not found: check the bucket name"
  if (e?.message && /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(e.message)) {
    return "Could not reach the endpoint"
  }
  return "The storage refused the request"
}

/**
 * "Test connection": write the probe object, read it back, and list the prefix. The probe is
 * rewritten in place each time and never deleted (ADR 0051).
 */
export async function testStorageConnection(
  conn: StorageConnectionConfig,
): Promise<{ ok: true } | { ok: false; step: StorageConnectionError["step"]; message: string }> {
  let raw: S3Bucket
  try {
    if (!conn.bucket) throw new StorageConnectionError("config", "No bucket set")
    const client = await customerClient(conn)
    raw = s3Bucket(
      () => client,
      () => conn.bucket as string,
      conn.prefix,
    )
  } catch (err) {
    const step = err instanceof StorageConnectionError ? err.step : "credentials"
    return { ok: false, step, message: describeStorageError(err) }
  }
  const body = new TextEncoder().encode(
    `Sahihi connection check ${new Date().toISOString()}. Sahihi never deletes your files; this one is rewritten on every check.\n`,
  )
  const steps: [StorageConnectionError["step"], () => Promise<unknown>][] = [
    ["write", () => raw.put(STORAGE_PROBE_KEY, body, "text/plain")],
    [
      "read",
      async () => {
        const back = await raw.get(STORAGE_PROBE_KEY)
        if ((await sha256Hex(back)) !== (await sha256Hex(body))) {
          throw new StorageConnectionError("read", "Read back different bytes than were written")
        }
      },
    ],
    ["list", () => raw.list(1)],
  ]
  for (const [step, run] of steps) {
    try {
      await run()
    } catch (err) {
      const action = { write: "write to", read: "read from", list: "list" }[step as "write"]
      return {
        ok: false,
        step,
        message: `Couldn't ${action ?? "use"} the bucket: ${describeStorageError(err)}`,
      }
    }
  }
  return { ok: true }
}
