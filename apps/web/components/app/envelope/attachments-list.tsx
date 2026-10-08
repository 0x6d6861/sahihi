"use client"

import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageUpIcon,
  PdfIcon,
  Trash2Icon,
} from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Progress } from "@/components/arc/progress/progress"
import { FileUpload } from "@/components/extend/file-upload"
import { api } from "@/lib/api"
import { type AttachmentView, formatFileSize } from "@/lib/envelope-documents"
import { UploadRejectedError, uploadAttachment } from "@/lib/upload-client"

/** Where a list reads its files from: the sender's envelope, or a signer's link (ADR 0037). */
export type AttachmentSource =
  | { kind: "sender"; envelopeId: string }
  | { kind: "signer"; base: string }

type Listed = Pick<AttachmentView, "id" | "name" | "contentType" | "sizeBytes"> & {
  status?: AttachmentView["status"]
}

function TypeIcon({ contentType }: { contentType: string }) {
  const cls = "size-5 shrink-0 text-muted-foreground"
  if (contentType === "application/pdf") return <PdfIcon aria-hidden className={cls} />
  if (contentType.startsWith("image/")) return <ImageUpIcon aria-hidden className={cls} />
  if (contentType.includes("sheet") || contentType === "text/csv")
    return <FileSpreadsheetIcon aria-hidden className={cls} />
  return <FileTextIcon aria-hidden className={cls} />
}

async function download(source: AttachmentSource, id: string) {
  const path =
    source.kind === "sender"
      ? `/envelopes/${source.envelopeId}/attachments/${id}/file`
      : `${source.base}/attachments/${id}`
  try {
    const { url } =
      source.kind === "sender"
        ? await api<{ url: string }>(path)
        : ((await (await fetch(`/api${path}`)).json()) as { url: string })
    // A presigned URL with `Content-Disposition: attachment`: the browser saves it.
    window.location.assign(url)
  } catch {
    toastManager.add({ title: "Couldn't download the file", type: "error" })
  }
}

/**
 * Supporting files of an envelope (ADR 0037): shared with recipients, never signed. Each row has
 * its type, name and size and a ⋮ menu (Download; Remove when `editable`). `editable` (a draft the
 * caller may edit) adds an Extend `FileUpload` zone; uploads show an Arc progress until they're
 * checked and hashed.
 */
export function AttachmentsList({
  attachments,
  source,
  editable = false,
}: {
  attachments: Listed[]
  source: AttachmentSource
  editable?: boolean
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState<{ name: string; percent: number }[]>([])
  const ready = attachments.filter((a) => (a.status ?? "READY") === "READY")
  const room = MAX_ATTACHMENTS - attachments.length - uploading.length

  async function add(files: File[]) {
    if (source.kind !== "sender") return
    const batch = files.slice(0, Math.max(0, room))
    if (files.length > batch.length) {
      toastManager.add({
        title: `An envelope can hold up to ${MAX_ATTACHMENTS} files`,
        type: "error",
      })
    }
    for (const file of batch) {
      setUploading((u) => [...u, { name: file.name, percent: 0 }])
      try {
        await uploadAttachment(source.envelopeId, file, (f) =>
          setUploading((u) =>
            u.map((x) => (x.name === file.name ? { ...x, percent: Math.round(f * 100) } : x)),
          ),
        )
      } catch (err) {
        toastManager.add({
          title: err instanceof UploadRejectedError ? "File not added" : "Upload failed",
          description: err instanceof Error ? err.message : undefined,
          type: "error",
        })
      } finally {
        setUploading((u) => u.filter((x) => x.name !== file.name))
      }
    }
    router.refresh()
  }

  async function remove(a: Listed) {
    if (source.kind !== "sender") return
    try {
      await api(`/envelopes/${source.envelopeId}/attachments/${a.id}`, { method: "DELETE" })
      toastManager.add({ title: `Removed “${a.name}”`, type: "success" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not removed",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {(ready.length > 0 || uploading.length > 0) && (
        <ul className="flex flex-col divide-y rounded-xl border">
          {ready.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-3 py-2 ps-3 pe-1">
              <TypeIcon contentType={a.contentType} />
              <span className="min-w-0 flex-1 truncate font-medium text-sm" title={a.name}>
                {a.name}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {formatFileSize(a.sizeBytes)}
              </span>
              <DropdownMenu
                label={`Actions for ${a.name}`}
                iconOnly
                icon={<EllipsisVerticalIcon />}
                items={[
                  {
                    label: "Download",
                    icon: <DownloadIcon />,
                    onSelect: () => void download(source, a.id),
                  },
                  ...(editable
                    ? [
                        {
                          label: "Remove",
                          icon: <Trash2Icon />,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () => void remove(a),
                        },
                      ]
                    : []),
                ]}
              />
            </li>
          ))}
          {uploading.map((u) => (
            <li key={`up-${u.name}`} className="flex flex-col gap-2 px-3 py-2.5">
              <span className="truncate font-medium text-sm">{u.name}</span>
              <Progress value={u.percent} label="Uploading" showValue />
            </li>
          ))}
        </ul>
      )}
      {editable && room > 0 && (
        <FileUpload
          className="w-full"
          accept={ATTACHMENT_ACCEPT}
          multiple
          showFileList={false}
          title="Click to add or drop files"
          description="PDF, images, Word, Excel, PowerPoint, CSV or text, up to 25 MB each"
          onFilesAccepted={(files) => void add(files)}
        />
      )}
    </div>
  )
}
