"use client"

import { useState } from "react"
import { DownloadIcon, FileTextIcon, PdfIcon, ShieldCheckIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { SplitButton, type SplitButtonAction } from "@/components/arc/split-button/split-button"
import { ApiError, api } from "@/lib/api"

/** `GET …/downloads` (ADR 0037): every link is presigned, short-lived and saved, never opened. */
interface DownloadLinks {
  documents: { id: string; name: string; url: string }[]
  certificate: string
  attachments: { id: string; name: string; url: string }[]
  bundle: string | null
}

type Pick =
  | { kind: "bundle" }
  | { kind: "certificate" }
  | { kind: "document" | "attachment"; id: string }

/**
 * Downloads for a completed envelope (ADR 0037). "Download all" (a zip of the signed documents,
 * the certificate and the supporting files) is the main action; the menu has each file on its own.
 * Links only live for 5 minutes, so they're fetched on click, never at page load.
 *
 * `endpoint` is `/envelopes/:id/downloads` (sender) or `/sign/:token/downloads` (recipient);
 * `documents` and `attachments` name the menu's items, in order.
 */
export function DownloadButtons({
  endpoint,
  documents,
  attachments = [],
}: {
  endpoint: string
  documents: { id: string; name: string }[]
  attachments?: { id: string; name: string }[]
}) {
  const [busy, setBusy] = useState(false)

  async function download(pick: Pick) {
    setBusy(true)
    try {
      const links = await api<DownloadLinks>(endpoint)
      const url =
        pick.kind === "bundle"
          ? (links.bundle ?? links.documents[0]?.url)
          : pick.kind === "certificate"
            ? links.certificate
            : (pick.kind === "document" ? links.documents : links.attachments).find(
                (x) => x.id === pick.id,
              )?.url
      if (!url) throw new Error("This file isn't available.")
      window.location.assign(url)
    } catch (err) {
      const preparing = err instanceof ApiError && err.status === 409
      toastManager.add({
        title: preparing ? "Still preparing the documents" : "Download failed",
        description: preparing
          ? "The signed PDFs and certificate are being produced. Try again in a minute."
          : err instanceof Error
            ? err.message
            : "Please try again.",
        type: preparing ? "info" : "error",
      })
    } finally {
      setBusy(false)
    }
  }

  const several = documents.length > 1 || attachments.length > 0
  if (!several) {
    // One signed document and its certificate: two plain buttons, as before.
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          loading={busy}
          onClick={() => download({ kind: "document", id: documents[0]?.id ?? "" })}
        >
          <DownloadIcon aria-hidden />
          Signed document
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => download({ kind: "certificate" })}
        >
          <DownloadIcon aria-hidden />
          Certificate
        </Button>
      </div>
    )
  }

  const actions: SplitButtonAction[] = [
    ...documents.map((d) => ({
      label: `${d.name.replace(/\.pdf$/i, "")} (signed)`,
      icon: <PdfIcon />,
      onSelect: () => void download({ kind: "document", id: d.id }),
    })),
    {
      label: "Certificate",
      icon: <ShieldCheckIcon />,
      onSelect: () => void download({ kind: "certificate" }),
    },
    ...attachments.map((a) => ({
      label: a.name,
      icon: <FileTextIcon />,
      onSelect: () => void download({ kind: "attachment", id: a.id }),
    })),
  ]
  return (
    <SplitButton
      label="Download all"
      icon={<DownloadIcon />}
      disabled={busy}
      onClick={() => void download({ kind: "bundle" })}
      actions={actions}
    />
  )
}
