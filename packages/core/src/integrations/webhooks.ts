import { z } from "zod"
import { isIpAddress } from "../security/client-ip"
import { timingSafeEqual, toHex } from "../security/crypto"

/**
 * Webhooks (docs/webhooks.md): per-org HTTPS endpoints that receive signed JSON events.
 * Pure logic only: event catalogue, signing/verification, secret encryption, URL safety, retries.
 */

export const WEBHOOK_EVENT_TYPES = [
  "envelope.sent",
  "recipient.signed",
  "envelope.completed",
  "envelope.declined",
  "envelope.voided",
  "envelope.expired",
] as const
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

/** Sent by "Send test event"; never subscribed to, always delivered to the chosen endpoint. */
export const WEBHOOK_TEST_EVENT = "webhook.test" as const

export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  "envelope.sent": "An envelope was sent for signing",
  "recipient.signed": "A recipient signed (or approved)",
  "envelope.completed": "Everyone signed; the signed PDF and certificate are ready",
  "envelope.declined": "A recipient declined to sign",
  "envelope.voided": "The sender voided an envelope",
  "envelope.expired": "An envelope expired before everyone signed",
}

export const WEBHOOK_SIGNATURE_HEADER = "Sahihi-Signature"
/** Receivers should reject signatures older than this (replay protection). */
export const WEBHOOK_TOLERANCE_SEC = 5 * 60
export const WEBHOOK_TIMEOUT_MS = 10_000
/** Attempts per delivery, including the first (≈ 2 days of retries, see webhookRetryDelayMs). */
export const WEBHOOK_MAX_ATTEMPTS = 10

// ── Schemas ──────────────────────────────────────────────────────────────────
const EventsSchema = z
  .array(z.enum(WEBHOOK_EVENT_TYPES))
  .min(1, "Pick at least one event")
  .transform((events) => [...new Set(events)])

export const CreateWebhookSchema = z.object({
  url: z.string().trim().max(2000),
  description: z.string().trim().max(200).optional(),
  events: EventsSchema,
})
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>

export const UpdateWebhookSchema = z
  .object({
    url: z.string().trim().max(2000).optional(),
    description: z.string().trim().max(200).nullable().optional(),
    events: EventsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update")

// ── URL safety (SSRF) ────────────────────────────────────────────────────────
const V4_BLOCKED: [number, number][] = [
  // [network as uint32, prefix length]
  [0x00000000, 8], // 0.0.0.0/8 "this network"
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // 169.254/16 link-local, cloud metadata
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0000200, 24], // 192.0.2/24 docs
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15 benchmarking
  [0xc6336400, 24], // 198.51.100/24 docs
  [0xcb007100, 24], // 203.0.113/24 docs
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved + broadcast
]

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0)
}

/**
 * True for addresses a webhook must never reach: private, loopback, link-local (incl. the cloud
 * metadata service), CGNAT, multicast, reserved, and their IPv6 equivalents.
 */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "")
  if (!isIpAddress(addr)) return true
  if (!addr.includes(":")) {
    const n = v4ToInt(addr)
    return V4_BLOCKED.some(([net, bits]) => n >>> (32 - bits) === net >>> (32 - bits))
  }
  // IPv4-mapped / -compatible (::ffff:10.0.0.1): judge the embedded IPv4.
  const embedded = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
  if (embedded) return isPrivateAddress(embedded)
  if (addr === "::" || addr === "::1") return true
  const first = Number.parseInt(addr.split(":")[0] || "0", 16)
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    (first === 0x2001 && addr.startsWith("2001:db8")) // documentation
  )
}

export type WebhookUrlCheck = { ok: true; url: URL } | { ok: false; message: string }

/**
 * Checks a webhook URL before it's saved (and again before each delivery). HTTPS only, no
 * credentials, no private IP literals or localhost names. `allowPrivate` (development/tests
 * only) also permits http and local addresses. DNS answers are checked separately at delivery.
 */
export function checkWebhookUrl(raw: string, { allowPrivate = false } = {}): WebhookUrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, message: "Enter a full URL, e.g. https://example.com/webhooks/sahihi" }
  }
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    return { ok: false, message: "Webhook URLs must use https://" }
  }
  if (url.username || url.password) {
    return { ok: false, message: "Remove the username/password from the URL" }
  }
  if (!allowPrivate) {
    const host = url.hostname.toLowerCase()
    const literal = host.replace(/^\[|\]$/g, "")
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      (isIpAddress(literal) && isPrivateAddress(literal)) ||
      !host.includes(".")
    ) {
      return { ok: false, message: "Webhook URLs must point to a public address" }
    }
  }
  url.hash = ""
  return { ok: true, url }
}

// ── Signing ──────────────────────────────────────────────────────────────────
const encoder = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)))
}

/** `Sahihi-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` */
export async function signWebhook(secret: string, timestampSec: number, body: string) {
  return `t=${timestampSec},v1=${await hmacHex(secret, `${timestampSec}.${body}`)}`
}

/**
 * What a receiver runs (also documented for tenants). Checks the timestamp is recent and any
 * `v1` signature matches (several appear while a secret is being rotated).
 */
export async function verifyWebhookSignature(
  header: string | null | undefined,
  body: string,
  secret: string,
  { nowSec = Math.floor(Date.now() / 1000), toleranceSec = WEBHOOK_TOLERANCE_SEC } = {},
): Promise<boolean> {
  if (!header) return false
  const parts = header.split(",").map((p) => p.trim().split("="))
  const t = Number(parts.find(([k]) => k === "t")?.[1])
  const signatures = parts.filter(([k, v]) => k === "v1" && v).map(([, v]) => v as string)
  if (!Number.isInteger(t) || signatures.length === 0) return false
  if (Math.abs(nowSec - t) > toleranceSec) return false
  const expected = await hmacHex(secret, `${t}.${body}`)
  return signatures.some((s) => timingSafeEqual(s, expected))
}

/** `whsec_` + 32 random bytes (base64url). Shown to the admin once. */
export function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const b64 = btoa(String.fromCharCode(...bytes))
  return `whsec_${b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`
}

// ── Secret encryption at rest (AES-256-GCM, key via HKDF) ────────────────────
async function encryptionKey(masterSecret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(masterSecret), "HKDF", false, [
    "deriveKey",
  ])
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("sahihi"),
      info: encoder.encode("webhook-endpoint-secret:v1"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** "v1.<iv b64>.<ciphertext b64>". The signing secret must be recoverable, so it's encrypted, not hashed. */
export async function encryptSecret(masterSecret: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(masterSecret),
    encoder.encode(plaintext),
  )
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`
}

export async function decryptSecret(masterSecret: string, stored: string): Promise<string> {
  const [version, iv, ct] = stored.split(".")
  if (version !== "v1" || !iv || !ct) throw new Error("Unsupported secret format")
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    await encryptionKey(masterSecret),
    unb64(ct),
  )
  return new TextDecoder().decode(pt)
}

// ── Retries ──────────────────────────────────────────────────────────────────
/**
 * Delay before attempt `attempt + 1` (attempt is 1-based): 30 s, 2 min, 8 min, 30 min, 1 h,
 * then every 6 h. With WEBHOOK_MAX_ATTEMPTS = 10 a failing endpoint is retried for about 2 days.
 */
export function webhookRetryDelayMs(attempt: number): number {
  const schedule = [30_000, 120_000, 480_000, 1_800_000, 3_600_000]
  return schedule[attempt - 1] ?? 6 * 3_600_000
}

/** Response bodies are stored for debugging, trimmed so a noisy endpoint can't bloat the DB. */
export function trimResponseBody(text: string, max = 1000): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

// ── Payloads ─────────────────────────────────────────────────────────────────
export interface WebhookEnvelopeSource {
  id: string
  title: string
  status: string
  signingOrder: string
  createdAt: Date
  sentAt: Date | null
  completedAt: Date | null
  voidedAt: Date | null
  voidReason: string | null
  document: { id: string; name: string; sha256: string | null }
  signedSha256: string | null
  certificate: { code: string } | null
  recipients: {
    id: string
    name: string
    email: string
    role: string
    order: number
    status: string
    signedAt: Date | null
    declinedAt: Date | null
    declineReason: string | null
  }[]
}

/**
 * `data.envelope` of every envelope event: a snapshot at emission time. Tenants get their own
 * envelope's data; never tokens, hashes of tokens, OTPs or IP addresses.
 */
export function envelopeEventData(e: WebhookEnvelopeSource, extra: Record<string, unknown> = {}) {
  return {
    envelope: {
      id: e.id,
      title: e.title,
      status: e.status,
      signingOrder: e.signingOrder,
      createdAt: e.createdAt.toISOString(),
      sentAt: e.sentAt?.toISOString() ?? null,
      completedAt: e.completedAt?.toISOString() ?? null,
      voidedAt: e.voidedAt?.toISOString() ?? null,
      voidReason: e.voidReason,
      document: { id: e.document.id, name: e.document.name, sha256: e.document.sha256 },
      signedSha256: e.signedSha256,
      certificateCode: e.certificate?.code ?? null,
      recipients: e.recipients.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        order: r.order,
        status: r.status,
        signedAt: r.signedAt?.toISOString() ?? null,
        declinedAt: r.declinedAt?.toISOString() ?? null,
        declineReason: r.declineReason,
      })),
    },
    ...extra,
  }
}

/** The JSON body POSTed to an endpoint. `id` is the delivery's event id (idempotency key). */
export function webhookBody(event: {
  id: string
  type: string
  createdAt: Date
  organizationId: string
  data: unknown
}): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt.toISOString(),
    organizationId: event.organizationId,
    data: event.data,
  })
}
