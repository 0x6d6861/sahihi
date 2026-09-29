import type { Instrumentation } from "next"

/**
 * Server-side error tracking for the Next.js app (docs/observability.md): server components,
 * route handlers and proxy.ts errors go to Sentry when SENTRY_DSN is set; otherwise nothing loads.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) return
  const [Sentry, { ERROR_TRACKING_DATA_COLLECTION, scrubErrorEvent }] = await Promise.all([
    import("@sentry/nextjs"),
    import("@sahihi/core"),
  ])
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    dataCollection: ERROR_TRACKING_DATA_COLLECTION,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubErrorEvent(event as never) as typeof event,
  })
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import("@sentry/nextjs")
  Sentry.captureRequestError(...args)
}
