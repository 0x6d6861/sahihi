"use client"

import { AVATAR_SIZE } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ImageUpIcon, Trash2Icon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Button } from "@/components/arc/button/button"
import { centerSquare } from "@/lib/account"
import { api } from "@/lib/api"

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"]
const MAX_SOURCE_BYTES = 10 * 1024 * 1024

/** Crop the centre square, scale to AVATAR_SIZE and re-encode as PNG (drops EXIF, GPS included). */
async function toAvatarPng(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const crop = centerSquare(bitmap.width, bitmap.height)
  const size = Math.min(AVATAR_SIZE, crop.size)
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Your browser can't process images")
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size)
  bitmap.close()
  return canvas.toDataURL("image/png")
}

/**
 * Profile picture (PUT/DELETE /api/me/avatar). It sets `User.image`, which the account menu and
 * the members table already show; without one they fall back to initials.
 */
export function ProfilePicture({
  name,
  email,
  image,
}: {
  name: string
  email: string
  image: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function upload(file: File) {
    setError(null)
    if (!ACCEPTED.includes(file.type)) return setError("Use a PNG, JPG or WebP image.")
    if (file.size > MAX_SOURCE_BYTES) return setError("Use an image under 10 MB.")
    setPending(true)
    try {
      const dataUrl = await toAvatarPng(file)
      await api("/me/avatar", { method: "PUT", json: { dataUrl } })
      toastManager.add({ title: "Picture updated", type: "success" })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the picture")
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    try {
      await api("/me/avatar", { method: "DELETE" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Picture not removed",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
      throw err
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name || email} src={image ?? undefined} size="xl" />
        <div className="flex flex-col gap-2">
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
              {image ? "Change picture" : "Upload picture"}
            </Button>
            {image && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                <Trash2Icon aria-hidden />
                Remove
              </Button>
            )}
          </div>
          <span className="text-muted-foreground text-xs">
            Seen by you and members of your workspaces. Cropped to a square.
          </span>
        </div>
      </div>
      {error && <Alert tone="danger" title={error} />}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove your picture?"
        description="Your initials will show instead."
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </div>
  )
}
