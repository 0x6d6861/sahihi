/**
 * Redaction for logs, error reports and the queue dashboard (docs/observability.md).
 * Rule 8: raw signing tokens and OTP codes are never logged. Personal data stays out of logs
 * too: log ids, not emails.
 */

/** Object keys whose values are never written to logs, error reports or the dashboard. */
const SECRET_KEYS = new Set([
  "token",
  "code",
  "otp",
  "password",
  "secret",
  "secretencrypted",
  "authorization",
  "cookie",
  "set-cookie",
  "tokenhash",
  "codehash",
  "dataurl",
  "email",
  "phone",
  "name",
])

export const REDACTED_VALUE = "[redacted]"

/**
 * Deep copy with secret and personal fields replaced (keys compared case-insensitively).
 * Also masks signing tokens inside string values (URLs, messages). Depth-limited and cycle-safe.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return maskTokens(value)
  if (value === null || typeof value !== "object") return value
  if (depth > 6) return "[depth]"
  if (seen.has(value)) return "[circular]"
  seen.add(value)
  if (value instanceof Error) {
    return { name: value.name, message: maskTokens(value.message) }
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEYS.has(k.toLowerCase()) ? REDACTED_VALUE : redact(v, depth + 1, seen)
  }
  return out
}

/** Signing tokens are 43 base64url characters after /sign/ (docs/security.md → Signing tokens). */
const SIGN_PATH = /(\/sign\/)[A-Za-z0-9_-]{43}/g
/** Query parameters that carry secrets (better-auth verification/reset links). */
const SECRET_QUERY = /([?&](?:token|code|otp)=)[^&#\s]+/gi

/** "/api/sign/Iw5E…A/file?x" → "/api/sign/[token]/file?x"; "?token=abc" → "?token=[redacted]". */
export function maskTokens(text: string): string {
  return text.replace(SIGN_PATH, "$1[token]").replace(SECRET_QUERY, `$1${REDACTED_VALUE}`)
}

export type LogLevel = "debug" | "info" | "warn" | "error"
const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export const shouldLog = (level: LogLevel, min: LogLevel) => LEVELS[level] >= LEVELS[min]

/** One JSON line: `{ time, level, service, msg, …fields }` with fields redacted. */
export function formatLogLine(
  level: LogLevel,
  service: string,
  msg: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
): string {
  return JSON.stringify({
    time: now.toISOString(),
    level,
    service,
    msg: maskTokens(msg),
    ...(redact(fields) as Record<string, unknown>),
  })
}

/**
 * Sentry `beforeSend`/`beforeSendTransaction` scrubber (structurally typed, so core doesn't
 * depend on Sentry): masks tokens in the URL and messages, drops cookies, auth headers, request
 * bodies and user fields other than the id.
 */
export function scrubErrorEvent<
  E extends {
    request?: {
      url?: string
      headers?: Record<string, string>
      cookies?: unknown
      data?: unknown
      query_string?: unknown
    }
    user?: Record<string, unknown>
    message?: string
    breadcrumbs?: { message?: string; data?: Record<string, unknown> }[]
    extra?: Record<string, unknown>
  },
>(event: E): E {
  if (event.request) {
    const { url, headers } = event.request
    event.request = {
      ...(url && { url: maskTokens(url) }),
      ...(headers && {
        headers: Object.fromEntries(
          Object.entries(headers).filter(
            ([k]) => !["cookie", "authorization", "set-cookie"].includes(k.toLowerCase()),
          ),
        ),
      }),
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {}
  if (event.message) event.message = maskTokens(event.message)
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      ...(b.message && { message: maskTokens(b.message) }),
      ...(b.data && { data: redact(b.data) as Record<string, unknown> }),
    }))
  }
  if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>
  return event
}

/**
 * Sentry 11 `dataCollection` (the SDK's own filter, applied before `beforeSend`): no user info,
 * cookies, bodies or query strings; only harmless request headers. Plain data, so core doesn't
 * depend on Sentry and the web and server share one policy.
 */
export const ERROR_TRACKING_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent", "content-type", "accept"] }, response: false },
  httpBodies: [] as never[],
  urlQueryParams: false,
}
