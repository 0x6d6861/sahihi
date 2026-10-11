"use client"

import type { CompleteAttachment } from "@assistant-ui/react"
import { useCallback, useRef, useState } from "react"
import { FileTextIcon, ImageUpIcon, LoaderIcon, PaperclipIcon, XIcon } from "@/components/app/icons"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { api } from "@/lib/api"
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_LIMITS,
  chatAttachmentKind,
  importErrorMessage,
  textDataUrl,
} from "@/lib/generator"
import { cn } from "@/lib/utils"

/**
 * Files attached to the next chat message (docs/ai-documents.md → Attachments, ADR 0050). Each is
 * prepared as soon as it's picked, so problems show before sending: a PDF, Word or text file is
 * read on the server (`POST …/attachments`) and goes as its text; an image is read here and goes
 * as it is, for reference. At most three per message.
 */
export interface PendingFile {
  id: string
  name: string
  kind: "image" | "document"
  status: "reading" | "ready" | "failed"
  error?: string
  /** Only the first part of a long document was kept. */
  truncated?: boolean
  attachment?: CompleteAttachment
}

/** Longest side, in pixels, an attached photo is sent at: plenty to read a document from. */
const MAX_IMAGE_SIDE = 2048

/**
 * A photo as it's sent: scaled down to 2048 px and re-encoded as JPEG when it's bigger than that or
 * over 1.5 MB, so a phone photo costs a fraction of the request and the model's tokens. GIFs and
 * small images go as they are.
 */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  )
  return blob ?? file
}

const readDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export function useChatAttachments(documentId: string) {
  const [files, setFiles] = useState<PendingFile[]>([])
  const count = useRef(0)
  count.current = files.length

  const patch = useCallback((id: string, change: Partial<PendingFile>) => {
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...change } : f)))
  }, [])

  const add = useCallback(
    (picked: Iterable<File>) => {
      for (const file of picked) {
        if (count.current >= CHAT_ATTACHMENT_LIMITS.perMessage) break
        count.current += 1
        const id = crypto.randomUUID()
        const kind = chatAttachmentKind(file)
        if (kind !== "image" && kind !== "document") {
          setFiles((list) => [
            ...list,
            { id, name: file.name, kind: "document", status: "failed", error: kind },
          ])
          continue
        }
        setFiles((list) => [...list, { id, name: file.name, kind, status: "reading" }])
        void (async () => {
          try {
            if (kind === "image") {
              const blob = await shrinkImage(file)
              const image = await readDataUrl(blob)
              patch(id, {
                status: "ready",
                attachment: {
                  id,
                  type: "image",
                  name: file.name,
                  contentType: blob.type || file.type,
                  status: { type: "complete" },
                  content: [{ type: "image", image, filename: file.name }],
                },
              })
            } else {
              const form = new FormData()
              form.set("file", file)
              const read = await api<{ name: string; text: string; truncated: boolean }>(
                `/generated-documents/${encodeURIComponent(documentId)}/attachments`,
                { method: "POST", body: form },
              )
              patch(id, {
                status: "ready",
                truncated: read.truncated,
                attachment: {
                  id,
                  type: "document",
                  name: read.name,
                  contentType: "text/plain",
                  status: { type: "complete" },
                  content: [
                    {
                      type: "file",
                      data: textDataUrl(read.text),
                      mimeType: "text/plain",
                      filename: read.name,
                    },
                  ],
                },
              })
            }
          } catch (err) {
            patch(id, { status: "failed", error: `${file.name}: ${importErrorMessage(err)}` })
          }
        })()
      }
    },
    [documentId, patch],
  )

  const remove = useCallback((id: string) => {
    setFiles((list) => list.filter((f) => f.id !== id))
  }, [])
  const clear = useCallback(() => setFiles([]), [])

  return {
    files,
    add,
    remove,
    clear,
    /** Attachments ready to send with the message. */
    ready: files.flatMap((f) => (f.status === "ready" && f.attachment ? [f.attachment] : [])),
    reading: files.some((f) => f.status === "reading"),
    full: files.length >= CHAT_ATTACHMENT_LIMITS.perMessage,
  }
}

/** The paperclip: opens the file picker. */
export function AttachButton({
  disabled,
  onFiles,
}: {
  disabled?: boolean
  onFiles: (files: FileList) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Tooltip content="Attach a file or an image">
        <IconButton
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-muted-foreground"
          aria-label="Attach a file or an image"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <PaperclipIcon aria-hidden />
        </IconButton>
      </Tooltip>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={CHAT_ATTACHMENT_ACCEPT}
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </>
  )
}

/** The files waiting to go with the next message: reading, ready (with a note) or why not. */
export function PendingFiles({
  files,
  onRemove,
}: {
  files: PendingFile[]
  onRemove: (id: string) => void
}) {
  if (files.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Attached files">
      {files.map((f) => (
        <li
          key={f.id}
          className={cn(
            "flex max-w-full items-center gap-1.5 rounded-lg border bg-background py-1 pr-1 pl-2 text-xs",
            f.status === "failed" && "border-destructive/40",
          )}
        >
          {f.status === "reading" ? (
            <LoaderIcon
              aria-hidden
              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
            />
          ) : f.kind === "image" ? (
            <ImageUpIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FileTextIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium" title={f.name}>
              {f.name}
            </span>
            {f.status === "failed" ? (
              <span className="text-destructive-foreground" role="alert">
                {f.error}
              </span>
            ) : f.status === "reading" ? (
              <span className="text-muted-foreground">Reading…</span>
            ) : f.kind === "image" ? (
              <span className="text-muted-foreground">Image, for reference</span>
            ) : f.truncated ? (
              <span className="text-muted-foreground">Long: only the start is used</span>
            ) : null}
          </span>
          <IconButton
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${f.name}`}
            onClick={() => onRemove(f.id)}
          >
            <XIcon aria-hidden />
          </IconButton>
        </li>
      ))}
    </ul>
  )
}

/** A sent message's files, in its bubble: the name and whether it was text or an image. */
export function SentFiles({
  attachments,
}: {
  attachments: readonly { id: string; name: string; type: string }[]
}) {
  if (attachments.length === 0) return null
  return (
    <ul className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
      {attachments.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-muted-foreground text-xs"
        >
          {a.type === "image" ? (
            <ImageUpIcon aria-hidden className="size-3.5" />
          ) : (
            <FileTextIcon aria-hidden className="size-3.5" />
          )}
          <span className="max-w-48 truncate" title={a.name}>
            {a.name}
          </span>
        </li>
      ))}
    </ul>
  )
}
