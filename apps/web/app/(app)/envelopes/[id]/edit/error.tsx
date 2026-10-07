"use client"

import { RouteError } from "@/components/app/route-states"

/** Errors in the draft editor: it fills the shell edge to edge, so centre the message itself. */
export default function EditorError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <RouteError error={error} retry={retry} homeHref="/envelopes" />
    </div>
  )
}
