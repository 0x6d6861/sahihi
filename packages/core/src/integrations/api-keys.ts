import { z } from "zod"
import { sha256Hex } from "../security/crypto"

/**
 * Public API keys (docs/public-api.md). A key is a bearer credential: stored only as a hash,
 * shown once, scoped, revocable, optionally expiring. It belongs to the workspace; the admin who
 * created it is recorded as the actor in audit trails.
 */

export const API_KEY_SCOPES = [
  "documents:read",
  "documents:write",
  "templates:read",
  "envelopes:read",
  "envelopes:write",
] as const
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export const API_KEY_SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  "documents:read": "Read documents",
  "documents:write": "Upload documents",
  "templates:read": "List and read templates",
  "envelopes:read": "Read envelopes and download signed PDFs and certificates",
  "envelopes:write": "Create, send and void envelopes, bulk send, embedded signing links",
}

export const API_KEY_PREFIX = "sahihi_sk_"
/** 32 random bytes, base64url (43 characters) after the prefix. */
export const API_KEY_RE = /^sahihi_sk_[A-Za-z0-9_-]{43}$/

export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `${API_KEY_PREFIX}${b64}`
}

/** Domain-separated hash (never the same as a signing-token hash of the same bytes). */
export const hashApiKey = (key: string) => sha256Hex(`api-key:${key}`)

/** What the UI shows to tell keys apart: "sahihi_sk_AbCd…WxYz". */
export const apiKeyHint = (key: string) =>
  `${key.slice(0, API_KEY_PREFIX.length + 4)}…${key.slice(-4)}`

export const API_KEY_EXPIRY_DAYS = [null, 30, 90, 365] as const

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name the key (e.g. the system that uses it)").max(80),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1, "Pick at least one permission")
    .transform((s) => [...new Set(s)]),
  expiresInDays: z.union([z.null(), z.literal(30), z.literal(90), z.literal(365)]).default(null),
})
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>

export const hasScope = (granted: readonly string[], needed: ApiKeyScope) =>
  granted.includes(needed)
