import { getEnv } from "@sahihi/config"
import { ERROR_TRACKING_DATA_COLLECTION, scrubErrorEvent } from "@sahihi/core"
import * as Sentry from "@sentry/bun"

/**
 * Error tracking (docs/observability.md): Sentry when SENTRY_DSN is set, otherwise nothing.
 * Events are scrubbed (`scrubErrorEvent`): no cookies, auth headers, bodies, user emails or
 * signing tokens. No performance tracing (errors only).
 */
let enabled = false

export function initErrorTracking(service: "api" | "worker") {
  const env = getEnv()
  if (!env.SENTRY_DSN || enabled) return enabled
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    dataCollection: ERROR_TRACKING_DATA_COLLECTION,
    tracesSampleRate: 0,
    initialScope: { tags: { service } },
    beforeSend: (event) => scrubErrorEvent(event as never) as typeof event,
    beforeBreadcrumb: (crumb) =>
      (scrubErrorEvent({ breadcrumbs: [crumb as never] }).breadcrumbs?.[0] ??
        crumb) as unknown as typeof crumb,
  })
  enabled = true
  return enabled
}

/** Report an unexpected error with ids for context (never payloads or personal data). */
export function captureError(
  err: unknown,
  context: Record<string, string | number | undefined> = {},
) {
  if (!enabled) return
  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) if (v !== undefined) scope.setTag(k, String(v))
    Sentry.captureException(err)
  })
}

/** Flush before exit (worker shutdown). */
export const flushErrors = (timeoutMs = 2000) =>
  enabled ? Sentry.flush(timeoutMs) : Promise.resolve(true)
