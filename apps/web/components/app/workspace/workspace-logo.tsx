"use client"

import { LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ImageUpIcon, Trash2Icon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { fitWithin } from "@/lib/account"
import { api } from "@/lib/api"

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"]
const MAX_SOURCE_BYTES = 5 * 1024 * 1024

/** Resize into the logo box and re-encode as PNG: storage only ever holds a small, clean PNG. */
async function toLogoPng(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const size = fitWithin(bitmap.width, bitmap.height, LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT)
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Your browser can't process images")
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  return canvas.toDataURL("image/png")
}

/**
 * Workspace logo (PUT/DELETE /api/workspace/logo). Shown in signing emails and on the signing
 * page. `logoPath` is the same-origin path of the current logo, or null.
 */
export function WorkspaceLogo({
  logoPath,
  name,
  canEdit,
}: {
  logoPath: string | null
  name: string
  canEdit: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function upload(file: File) {
    setError(null)
    if (!ACCEPTED.includes(file.type)) return setError("Use a PNG, JPG or WebP image.")
    if (file.size > MAX_SOURCE_BYTES) return setError("Use an image under 5 MB.")
    setPending(true)
    try {
      const dataUrl = await toLogoPng(file)
      await api("/workspace/logo", { method: "PUT", json: { dataUrl } })
      toastManager.add({ title: "Logo updated", type: "success" })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the logo")
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    try {
      await api("/workspace/logo", { method: "DELETE" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Logo not removed",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
      throw err
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Logos are made for white email backgrounds, so the preview matches in either theme. */}
      <div className="on-paper flex h-24 items-center justify-center rounded-2xl border border-dashed bg-background p-4 sm:max-w-sm">
        {logoPath ? (
          // biome-ignore lint/performance/noImgElement: same-origin branding route, sized by CSS
          <img
            src={logoPath}
            alt={`${name} logo`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-muted-foreground text-xs">No logo. Emails show the name.</span>
        )}
      </div>
      {error && <Alert tone="danger" title={error} />}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ""
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={pending}
            onClick={() => inputRef.current?.click()}
          >
            <ImageUpIcon aria-hidden />
            {logoPath ? "Replace logo" : "Upload logo"}
          </Button>
          {logoPath && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
              <Trash2Icon aria-hidden />
              Remove
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the logo?"
        description="Emails and signing pages will show the workspace name instead."
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </div>
  )
}
