"use client"

import { RouteError } from "@/components/app/route-states"

/** Errors in an app page; the shell (sidebar, workspace) stays usable around it. */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return <RouteError error={error} retry={retry} homeHref="/documents" />
}
