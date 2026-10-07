"use client"

import { useEffect } from "react"
import { ButtonLink } from "@/components/app/button-link"
import { FileSearchIcon, TriangleAlertIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { EmptyState } from "@/components/arc/empty-state/empty-state"

/**
 * Fallbacks for `error.tsx` and `not-found.tsx`. Server errors are already reported by
 * `instrumentation.ts`; a client render error caught here is reported to Sentry when the browser
 * DSN is set (docs/observability.md), and otherwise only logged to the console.
 */
export function RouteError({
  error,
  retry,
  homeHref,
}: {
  error: Error & { digest?: string }
  retry: () => void
  homeHref: string
}) {
  useEffect(() => {
    console.error(error)
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs")
        .then((Sentry) => Sentry.captureException(error))
        .catch(() => {
          // Error tracking must never break the page.
        })
    }
  }, [error])

  const reference = error.digest ? ` and quote ${error.digest}` : ""
  return (
    <EmptyState
      className="md:py-16"
      icon={<TriangleAlertIcon aria-hidden />}
      title="This page didn't load"
      description={`Something went wrong on our side. Try again. If it keeps happening, contact support${reference}.`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <ButtonLink href={homeHref}>Go to documents</ButtonLink>
        </div>
      }
    />
  )
}

export function RouteNotFound({ homeHref }: { homeHref: string }) {
  return (
    <EmptyState
      className="md:py-16"
      icon={<FileSearchIcon aria-hidden />}
      title="Page not found"
      description="The link may be mistyped, or what it pointed to was deleted or belongs to another workspace."
      action={
        <ButtonLink href={homeHref} variant="primary">
          Go to documents
        </ButtonLink>
      }
    />
  )
}
