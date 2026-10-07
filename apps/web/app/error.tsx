"use client"

import { RouteError } from "@/components/app/route-states"

/** Errors outside the app shell: auth, signing, verify. */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <RouteError error={error} retry={retry} homeHref="/" />
    </main>
  )
}
