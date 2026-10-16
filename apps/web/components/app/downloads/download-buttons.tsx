"use client"

import { useState } from "react"
import { Button } from "@/components/app/button"
import {
  AwardIcon,
  DownloadIcon,
  FileTextIcon,
  PaperclipIcon,
  PdfIcon,
  ShieldCheckIcon,
} from "@/components/app/icons"
import { SplitButton, type SplitButtonAction } from "@/components/app/split-button"
import { toastManager } from "@/components/app/toast"
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
/** Fetches fresh links on each click and saves the picked file; `busy` while it runs. */
function useDownload(endpoint: string) {
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

  return { busy, download }
}

export function DownloadButtons({
  endpoint,
  documents,
  attachments = [],
}: {
  endpoint: string
  documents: { id: string; name: string }[]
  attachments?: { id: string; name: string }[]
}) {
  const { busy, download } = useDownload(endpoint)

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

/**
 * The same downloads as a list of rows (the signing page once everyone has signed): each signed
 * document, the Certificate of Completion with its code, then the supporting files.
 */
export function DownloadRows({
  endpoint,
  documents,
  attachments = [],
  certificateCode,
}: {
  endpoint: string
  documents: { id: string; name: string }[]
  attachments?: { id: string; name: string }[]
  certificateCode: string | null
}) {
  const { busy, download } = useDownload(endpoint)
  const rows: { key: string; icon: React.ReactNode; title: string; detail: string; pick: Pick }[] =
    [
      ...documents.map((d) => ({
        key: `d-${d.id}`,
        icon: <FileTextIcon className="size-[18px]" />,
        title: documents.length > 1 ? d.name.replace(/\.pdf$/i, "") : "Signed document",
        detail: `${d.name.replace(/\.pdf$/i, "")} (signed).pdf`,
        pick: { kind: "document" as const, id: d.id },
      })),
      {
        key: "certificate",
        icon: <AwardIcon className="size-[18px]" />,
        title: "Certificate of Completion",
        detail: certificateCode ? `Certificate ${certificateCode}` : "PDF",
        pick: { kind: "certificate" as const },
      },
      ...attachments.map((a) => ({
        key: `a-${a.id}`,
        icon: <PaperclipIcon className="size-[18px]" />,
        title: a.name,
        detail: "Supporting file",
        pick: { kind: "attachment" as const, id: a.id },
      })),
    ]
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void download(r.pick)}
            aria-label={`Download ${r.title}`}
            className="press flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span aria-hidden className="shrink-0">
              {r.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-[1.45]">
              <span className="truncate font-medium text-sm">{r.title}</span>
              <span className="truncate text-muted-foreground text-xs">{r.detail}</span>
            </span>
            <DownloadIcon aria-hidden className="shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  )
}
