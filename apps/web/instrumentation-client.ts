import { ERROR_TRACKING_DATA_COLLECTION, scrubErrorEvent } from "@sahihi/core"

/**
 * Browser error tracking (docs/observability.md). Sentry loads only when NEXT_PUBLIC_SENTRY_DSN
 * is set at build time, via a dynamic import, so it costs nothing otherwise. Events are scrubbed:
 * no cookies, bodies or user emails; signing tokens in URLs are masked.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  void import("@sentry/nextjs")
    .then((Sentry) =>
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
        dataCollection: ERROR_TRACKING_DATA_COLLECTION,
        tracesSampleRate: 0,
        beforeSend: (event) => scrubErrorEvent(event as never) as typeof event,
      }),
    )
    .catch(() => {
      // Error tracking must never break the app.
    })
}
