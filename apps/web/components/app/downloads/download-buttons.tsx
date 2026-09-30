"use client"

import { DownloadIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import { ApiError, api } from "@/lib/api"

type Kind = "signed" | "certificate"

const LABEL: Record<Kind, string> = { signed: "Signed document", certificate: "Certificate" }

/**
 * Downloads for a completed envelope. Links are presigned and only live for 5 minutes, so they're
 * fetched when the button is clicked, never at page load. The server marks them as attachments, so
 * the browser saves the file instead of leaving the page.
 *
 * `endpoint` is `/envelopes/:id/downloads` (sender) or `/sign/:token/downloads` (recipient).
 */
export function DownloadButtons({ endpoint }: { endpoint: string }) {
  const [busy, setBusy] = useState<Kind | null>(null)

  async function download(kind: Kind) {
    setBusy(kind)
    try {
      const links = await api<Record<Kind, string>>(endpoint)
      window.location.assign(links[kind])
    } catch (err) {
      const preparing = err instanceof ApiError && err.status === 409
      toastManager.add({
        title: preparing ? "Still preparing the documents" : "Download failed",
        description: preparing
          ? "The signed PDF and certificate are being produced. Try again in a minute."
          : err instanceof Error
            ? err.message
            : "Please try again.",
        type: preparing ? "info" : "error",
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(["signed", "certificate"] as const).map((kind) => (
        <Button
          key={kind}
          variant={kind === "signed" ? "default" : "outline"}
          disabled={busy !== null}
          onClick={() => download(kind)}
        >
          {busy === kind ? <Spinner aria-hidden /> : <DownloadIcon aria-hidden />}
          {LABEL[kind]}
        </Button>
      ))}
    </div>
  )
}
