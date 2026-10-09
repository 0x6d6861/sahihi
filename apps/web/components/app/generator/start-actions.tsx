"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/arc/button/button"
import { ApiError, api } from "@/lib/api"

/** Creates a document from a starter and opens it in the generator. */
export function StartFromStarter({ starter }: { starter: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const { id } = await api<{ id: string }>("/generated-documents", {
              method: "POST",
              json: { starter },
            })
            router.push(`/generate/${id}`)
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't start. Try again.")
            setBusy(false)
          }
        }}
      >
        Start
      </Button>
      {error && <span className="text-destructive-foreground text-sm">{error}</span>}
    </div>
  )
}

/** Owners and admins: turn the assistant on for the workspace. */
export function EnableAssistant() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await api("/generated-documents/settings", { method: "PUT", json: { enabled: true } })
            router.refresh()
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't turn it on. Try again.")
          } finally {
            setBusy(false)
          }
        }}
      >
        Turn on for this workspace
      </Button>
      {error && <span className="text-destructive-foreground text-sm">{error}</span>}
    </div>
  )
}
