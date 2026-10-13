import { z } from "zod"
import { safeFileName } from "../envelope/documents"
import { timingSafeEqual } from "../security/crypto"
import { checkWebhookUrl } from "./webhooks"

/**
 * Bring your own storage (docs/storage.md, ADR 0051). Pure logic only: providers, schemas,
 * endpoint and bucket checks, sync folder names, signed tickets for proxied file access, and the
 * IAM policies shown in the setup guide.
 */

// ── Enums (mirrored by Prisma, packages/db/src/enums.test.ts) ────────────────
export const STORAGE_PROVIDERS = [
  "AWS_S3",
  "CLOUDFLARE_R2",
  "BACKBLAZE_B2",
  "WASABI",
  "DIGITALOCEAN_SPACES",
  "GOOGLE_CLOUD_STORAGE",
  "S3_COMPATIBLE",
  "GOOGLE_DRIVE",
  "ONEDRIVE",
] as const
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number]

/** SYNC: completed envelopes are copied there (Business). PRIMARY: every workspace file lives there (Enterprise). */
export const STORAGE_PURPOSES = ["SYNC", "PRIMARY"] as const
export type StoragePurpose = (typeof STORAGE_PURPOSES)[number]

export const STORAGE_AUTH_METHODS = ["ACCESS_KEYS", "AWS_ROLE", "OAUTH"] as const
export type StorageAuthMethod = (typeof STORAGE_AUTH_METHODS)[number]

/** PENDING until "Test connection" passes; FAILING after a failed check or delivery. */
export const STORAGE_CONNECTION_STATUSES = ["PENDING", "ACTIVE", "FAILING"] as const
export type StorageConnectionStatus = (typeof STORAGE_CONNECTION_STATUSES)[number]

/** Where a PRIMARY connection is in its life: files moving in, in use, or moving back out. */
export const STORAGE_PRIMARY_STATES = ["MIGRATING_IN", "ACTIVE", "MIGRATING_OUT"] as const
export type StoragePrimaryState = (typeof STORAGE_PRIMARY_STATES)[number]

export const STORAGE_DELIVERY_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"] as const
export type StorageDeliveryStatus = (typeof STORAGE_DELIVERY_STATUSES)[number]

/** Why a file in a customer's bucket stopped being used. Sahihi never deletes it (ADR 0051). */
export const STORAGE_RELEASE_REASONS = [
  "DELETED",
  "REPLACED",
  "UPLOAD_REJECTED",
  "RETENTION",
  "EXPIRED",
  "WORKSPACE_DELETED",
] as const
export type StorageReleaseReason = (typeof STORAGE_RELEASE_REASONS)[number]

export const STORAGE_RELEASE_REASON_LABELS: Record<StorageReleaseReason, string> = {
  DELETED: "Deleted in Sahihi",
  REPLACED: "Replaced by a newer version",
  UPLOAD_REJECTED: "Upload rejected",
  RETENTION: "Purged by retention",
  EXPIRED: "Download expired",
  WORKSPACE_DELETED: "Workspace deleted",
}

// ── Providers ────────────────────────────────────────────────────────────────
export interface StorageProviderInfo {
  label: string
  /** s3: any S3-compatible bucket. drive / onedrive: OAuth to a person's cloud drive (sync only). */
  kind: "s3" | "drive" | "onedrive"
  /** Builds the endpoint from region and account id; null means the user enters it (or AWS's default). */
  endpoint: ((v: { region: string; accountId?: string }) => string) | null
  defaultRegion?: string
  /** The form asks for an account id (Cloudflare R2). */
  needsAccountId?: boolean
  forcePathStyle: boolean
  /** Object tags work, so released files can be tagged for a lifecycle rule. */
  supportsTagging: boolean
  /** IAM role access (STS AssumeRole) instead of keys. */
  supportsRole: boolean
  /** Can hold a workspace's primary storage (S3-compatible only). */
  supportsPrimary: boolean
  /** Shown under the provider in the form. */
  help: string
}

export const STORAGE_PROVIDER_INFO: Record<StorageProvider, StorageProviderInfo> = {
  AWS_S3: {
    label: "Amazon S3",
    kind: "s3",
    endpoint: null,
    defaultRegion: "eu-west-1",
    forcePathStyle: false,
    supportsTagging: true,
    supportsRole: true,
    supportsPrimary: true,
    help: "Use an IAM role (recommended) or an access key for an IAM user.",
  },
  CLOUDFLARE_R2: {
    label: "Cloudflare R2",
    kind: "s3",
    endpoint: ({ accountId }) => `https://${accountId}.r2.cloudflarestorage.com`,
    defaultRegion: "auto",
    needsAccountId: true,
    forcePathStyle: true,
    supportsTagging: false,
    supportsRole: false,
    supportsPrimary: true,
    help: "Create an R2 API token with Object Read & Write on this bucket.",
  },
  BACKBLAZE_B2: {
    label: "Backblaze B2",
    kind: "s3",
    endpoint: ({ region }) => `https://s3.${region}.backblazeb2.com`,
    defaultRegion: "us-west-004",
    forcePathStyle: false,
    supportsTagging: false,
    supportsRole: false,
    supportsPrimary: true,
    help: "Create an application key with read and write access to this bucket, without delete.",
  },
  WASABI: {
    label: "Wasabi",
    kind: "s3",
    endpoint: ({ region }) => `https://s3.${region}.wasabisys.com`,
    defaultRegion: "eu-central-1",
    forcePathStyle: false,
    supportsTagging: true,
    supportsRole: false,
    supportsPrimary: true,
    help: "Use an access key for a sub-user whose policy allows put, get and list only.",
  },
  DIGITALOCEAN_SPACES: {
    label: "DigitalOcean Spaces",
    kind: "s3",
    endpoint: ({ region }) => `https://${region}.digitaloceanspaces.com`,
    defaultRegion: "fra1",
    forcePathStyle: false,
    supportsTagging: false,
    supportsRole: false,
    supportsPrimary: true,
    help: "Create a Spaces access key limited to this bucket.",
  },
  GOOGLE_CLOUD_STORAGE: {
    label: "Google Cloud Storage",
    kind: "s3",
    endpoint: () => "https://storage.googleapis.com",
    defaultRegion: "auto",
    forcePathStyle: true,
    supportsTagging: false,
    supportsRole: false,
    supportsPrimary: true,
    help: "Use an HMAC key (Interoperability) for a service account with Storage Object Creator and Viewer.",
  },
  S3_COMPATIBLE: {
    label: "Other S3-compatible",
    kind: "s3",
    endpoint: null,
    defaultRegion: "us-east-1",
    forcePathStyle: true,
    supportsTagging: false,
    supportsRole: false,
    supportsPrimary: true,
    help: "MinIO, Ceph, Scaleway, OVHcloud and others: enter the endpoint URL.",
  },
  GOOGLE_DRIVE: {
    label: "Google Drive",
    kind: "drive",
    endpoint: null,
    forcePathStyle: false,
    supportsTagging: false,
    supportsRole: false,
    supportsPrimary: false,
    help: "Sign in with Google. Sahihi only sees the files it creates.",
  },
  ONEDRIVE: {
    label: "OneDrive",
    kind: "onedrive",
    endpoint: null,
    forcePathStyle: false,
    supportsTagging: false,
    supportsRole: false,
    supportsPrimary: false,
    help: "Sign in with Microsoft. Files go to Sahihi's app folder in your OneDrive.",
  },
}

export const isS3Provider = (p: StorageProvider) => STORAGE_PROVIDER_INFO[p].kind === "s3"

// ── Checks ───────────────────────────────────────────────────────────────────
/** S3 bucket naming rules (also fine for R2, B2, Wasabi, Spaces and GCS). */
export const BUCKET_NAME = /^(?!\d+\.\d+\.\d+\.\d+$)(?!xn--)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

/** `contracts/sahihi` → `contracts/sahihi/`; "" stays "". Letters, digits, `. _ - /` only. */
export function normalizePrefix(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "")
  return trimmed ? `${trimmed}/` : ""
}

const PREFIX_CHARS = /^[A-Za-z0-9._\-/]*$/

export type StorageEndpointCheck = { ok: true; url: string } | { ok: false; message: string }

/**
 * Checks a custom endpoint before it's saved and before each use: HTTPS, a public host, no
 * credentials, no path. Same SSRF rules as webhooks. `allowPrivate` (development/tests only)
 * permits http and local addresses, e.g. MinIO on localhost.
 */
export function checkStorageEndpoint(
  raw: string,
  { allowPrivate = false } = {},
): StorageEndpointCheck {
  const checked = checkWebhookUrl(raw, { allowPrivate })
  if (!checked.ok) {
    return { ok: false, message: checked.message.replace("Webhook URLs", "Endpoints") }
  }
  const url = checked.url
  if ((url.pathname !== "/" && url.pathname !== "") || url.search) {
    return { ok: false, message: "Enter the endpoint without a path, e.g. https://s3.example.com" }
  }
  return { ok: true, url: url.origin }
}

/** The endpoint to call: the preset's, the user's, or null for AWS's regional default. */
export function resolveStorageEndpoint(input: {
  provider: StorageProvider
  region: string
  accountId?: string
  endpoint?: string
}): string | null {
  const info = STORAGE_PROVIDER_INFO[input.provider]
  if (info.endpoint) return info.endpoint({ region: input.region, accountId: input.accountId })
  return input.endpoint?.trim() || null
}

// ── Request schemas ──────────────────────────────────────────────────────────
export const DEFAULT_SYNC_FOLDER = "{yyyy}/{mm}/{title} ({id})"
const FOLDER_TOKENS = ["{yyyy}", "{mm}", "{dd}", "{title}", "{id}"]

const FolderTemplateSchema = z
  .string()
  .trim()
  .min(1, "Enter a folder pattern")
  .max(200)
  .refine((v) => v.includes("{id}"), "Include {id}, so every envelope gets its own folder")
  .refine(
    (v) => !/\{[^}]*\}/.test(FOLDER_TOKENS.reduce((s, t) => s.replaceAll(t, ""), v)),
    "Use only {yyyy}, {mm}, {dd}, {title} and {id}",
  )

const S3FieldsSchema = z.object({
  provider: z.enum(STORAGE_PROVIDERS).refine(isS3Provider, "Not an S3-compatible provider"),
  bucket: z.string().trim().regex(BUCKET_NAME, "Enter a valid bucket name"),
  region: z.string().trim().min(1, "Enter the region").max(64),
  /** Cloudflare R2 */
  accountId: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i, "Enter your 32-character Cloudflare account ID")
    .optional(),
  /** S3_COMPATIBLE (and AWS, optionally) */
  endpoint: z.string().trim().max(500).optional(),
  prefix: z
    .string()
    .max(200)
    .default("")
    .refine((v) => PREFIX_CHARS.test(v), "Use letters, digits, . _ - and / only")
    .transform(normalizePrefix),
})

const KeysAuthSchema = z.object({
  auth: z.literal("ACCESS_KEYS"),
  accessKeyId: z.string().trim().min(4, "Enter the access key ID").max(200),
  secretAccessKey: z.string().trim().min(8, "Enter the secret access key").max(500),
})
const RoleAuthSchema = z.object({
  auth: z.literal("AWS_ROLE"),
  roleArn: z
    .string()
    .trim()
    .regex(/^arn:aws(-[a-z]+)*:iam::\d{12}:role\/[\w+=,.@\-/]{1,512}$/, "Enter the role's ARN"),
})

export const CreateS3ConnectionSchema = z
  .object({
    purpose: z.enum(STORAGE_PURPOSES),
    name: z.string().trim().min(1, "Give it a name").max(80),
    folderTemplate: FolderTemplateSchema.default(DEFAULT_SYNC_FOLDER),
  })
  .and(S3FieldsSchema)
  .and(z.discriminatedUnion("auth", [KeysAuthSchema, RoleAuthSchema]))
  .superRefine((v, ctx) => {
    const info = STORAGE_PROVIDER_INFO[v.provider]
    if (info.needsAccountId && !v.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Enter your account ID" })
    }
    if (v.provider === "S3_COMPATIBLE" && !v.endpoint) {
      ctx.addIssue({ code: "custom", path: ["endpoint"], message: "Enter the endpoint URL" })
    }
    if (v.auth === "AWS_ROLE" && !info.supportsRole) {
      ctx.addIssue({ code: "custom", path: ["auth"], message: "Only Amazon S3 supports roles" })
    }
  })
export type CreateS3ConnectionInput = z.infer<typeof CreateS3ConnectionSchema>

export const UpdateStorageConnectionSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(80).optional(),
    folderTemplate: FolderTemplateSchema.optional(),
    /** New keys (rotation). The old secret stops being used immediately. */
    accessKeyId: z.string().trim().min(4).max(200).optional(),
    secretAccessKey: z.string().trim().min(8).max(500).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update")
  .refine(
    (v) => (v.accessKeyId === undefined) === (v.secretAccessKey === undefined),
    "Enter both the access key ID and the secret",
  )

/** Copy envelopes completed in the last `days` days to a sync destination. */
export const StorageBackfillSchema = z.object({
  days: z.coerce.number().int().min(1).max(365),
})

/** Start an OAuth connection (Google Drive, OneDrive). */
export const StartOAuthConnectionSchema = z.object({
  provider: z.enum(["GOOGLE_DRIVE", "ONEDRIVE"]),
  name: z.string().trim().min(1, "Give it a name").max(80),
  folderTemplate: FolderTemplateSchema.default(DEFAULT_SYNC_FOLDER),
  /** The top folder Sahihi creates its folders in. */
  rootFolder: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((v) => !/[\\/:*?"<>|]/.test(v), "Folder names can't contain \\ / : * ? \" < > |")
    .default("Sahihi"),
})

// ── Sync folder names ────────────────────────────────────────────────────────
/** A path segment that's safe on S3, Drive and OneDrive: no slashes or reserved characters. */
export function pathSegment(raw: string, fallback = "untitled"): string {
  const cleaned = safeFileName(raw, fallback)
    .replace(/[:*?"<>|#%]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim()
  return cleaned || fallback
}

/**
 * The folder an envelope's files go to: `{yyyy}/{mm}/{title} ({id})` → `2026/10/Lease (k3j9x2)`.
 * Dates are UTC; `{id}` is the envelope id's last 8 characters (enough to tell envelopes apart).
 */
export function syncFolderPath(
  template: string,
  envelope: { id: string; title: string; completedAt: Date },
): string {
  const d = envelope.completedAt
  const pad = (n: number) => String(n).padStart(2, "0")
  return template
    .split("/")
    .map((part) =>
      part
        .replaceAll("{yyyy}", String(d.getUTCFullYear()))
        .replaceAll("{mm}", pad(d.getUTCMonth() + 1))
        .replaceAll("{dd}", pad(d.getUTCDate()))
        .replaceAll("{title}", pathSegment(envelope.title))
        .replaceAll("{id}", envelope.id.slice(-8)),
    )
    .map((part) => pathSegment(part))
    .filter(Boolean)
    .join("/")
}

// ── Proxied file access (customer buckets) ───────────────────────────────────
/**
 * A signed, expiring reference to one object, used instead of a presigned URL when the object is
 * in a customer's bucket: the browser fetches `/api/storage/objects/<ticket>` on our origin and the
 * API streams the file (docs/storage.md → File access). Like a presigned URL, holding it is the
 * permission, so it lives as briefly as one.
 */
export interface StorageTicket {
  /** Organization */
  o: string
  /** Object key */
  k: string
  /** Expiry, unix seconds */
  e: number
  /** Download file name */
  f?: string
  /** Disposition: "a" attachment, "i" inline */
  d?: "a" | "i"
  /** Cacheable (thumbnails) */
  c?: 1
}

const encoder = new TextEncoder()
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

async function hmacKey(secret: string, info: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ])
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("sahihi"),
      info: encoder.encode(info),
    },
    base,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  )
}

async function sign(secret: string, payload: string, info = "storage-ticket:v1"): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret, info), encoder.encode(payload))
  return b64url(new Uint8Array(mac))
}

export async function signStorageTicket(secret: string, ticket: StorageTicket): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify(ticket)))
  return `${payload}.${await sign(secret, payload)}`
}

/**
 * The ticket, if its signature is ours, it hasn't expired, and its key belongs to its workspace.
 * Null otherwise (the route answers 404, revealing nothing).
 */
export async function verifyStorageTicket(
  secret: string,
  raw: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<StorageTicket | null> {
  const [payload, mac, extra] = raw.split(".")
  if (!payload || !mac || extra !== undefined || raw.length > 4000) return null
  if (!timingSafeEqual(mac, await sign(secret, payload))) return null
  let t: StorageTicket
  try {
    t = JSON.parse(new TextDecoder().decode(unb64url(payload)))
  } catch {
    return null
  }
  if (typeof t.o !== "string" || typeof t.k !== "string" || typeof t.e !== "number") return null
  if (t.e < nowSec) return null
  if (!t.k.startsWith(`org/${t.o}/`) || t.k.includes("..")) return null
  return t
}

// ── OAuth state (Google Drive, OneDrive) ─────────────────────────────────────
/** What the OAuth `state` parameter carries through the provider's consent screen. */
export interface StorageOAuthState {
  /** Organization and user who started it; the callback must come back to the same pair. */
  o: string
  u: string
  p: "GOOGLE_DRIVE" | "ONEDRIVE"
  name: string
  folderTemplate: string
  rootFolder: string
  /** Expiry, unix seconds */
  e: number
}

const STATE_INFO = "storage-oauth-state:v1"

export async function signOAuthState(secret: string, state: StorageOAuthState): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify(state)))
  return `${payload}.${await sign(secret, payload, STATE_INFO)}`
}

export async function verifyOAuthState(
  secret: string,
  raw: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<StorageOAuthState | null> {
  const [payload, mac, extra] = raw.split(".")
  if (!payload || !mac || extra !== undefined || raw.length > 4000) return null
  if (!timingSafeEqual(mac, await sign(secret, payload, STATE_INFO))) return null
  try {
    const state = JSON.parse(new TextDecoder().decode(unb64url(payload))) as StorageOAuthState
    return typeof state.e === "number" && state.e >= nowSec ? state : null
  } catch {
    return null
  }
}

// ── AWS role setup (shown in the form) ───────────────────────────────────────
/**
 * The ExternalId a workspace's IAM role must require: derived from a server secret and the
 * workspace id, so it's stable for the workspace, unguessable, and no workspace can present
 * another's (the confused-deputy protection AWS recommends).
 */
export async function awsExternalId(secret: string, organizationId: string): Promise<string> {
  return `sahihi-${(await sign(secret, organizationId, "aws-external-id:v1")).slice(0, 24)}`
}

/** Trust policy for the customer's role: Sahihi's AWS account may assume it with the ExternalId. */
export function awsRoleTrustPolicy(sahihiAccountId: string, externalId: string) {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${sahihiAccountId}:root` },
        Action: "sts:AssumeRole",
        Condition: { StringEquals: { "sts:ExternalId": externalId } },
      },
    ],
  }
}

/**
 * The permissions Sahihi needs: write, read and list under the prefix, and (where supported) tag
 * released files. Never `s3:DeleteObject`: Sahihi never deletes your files (ADR 0051).
 */
export function storageBucketPolicy(bucket: string, prefix: string, { tagging = false } = {}) {
  const objects = `arn:aws:s3:::${bucket}/${prefix}*`
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:PutObject", "s3:GetObject", ...(tagging ? ["s3:PutObjectTagging"] : [])],
        Resource: objects,
      },
      {
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: `arn:aws:s3:::${bucket}`,
        ...(prefix && { Condition: { StringLike: { "s3:prefix": [`${prefix}*`] } } }),
      },
    ],
  }
}

/** The fixed object "Test connection" writes and reads. It's rewritten in place, never deleted. */
export const STORAGE_PROBE_KEY = ".sahihi/connection-check"
