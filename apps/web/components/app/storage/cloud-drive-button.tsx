"use client"

import { DEFAULT_SYNC_FOLDER, STORAGE_PROVIDER_INFO } from "@sahihi/core"
import { useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { PlusIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { api } from "@/lib/api"

/**
 * Connect Google Drive or OneDrive (docs/storage.md → Cloud drives): name the destination, then
 * the provider's sign-in page asks for access and comes back to Settings → Storage.
 */
export function CloudDriveButton({
  provider,
  disabled,
}: {
  provider: "GOOGLE_DRIVE" | "ONEDRIVE"
  disabled?: boolean
}) {
  const label = STORAGE_PROVIDER_INFO[provider].label
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(label)
  const [rootFolder, setRootFolder] = useState("Sahihi")
  const [folderTemplate, setFolderTemplate] = useState(DEFAULT_SYNC_FOLDER)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    try {
      const { url } = await api<{ url: string }>("/storage/oauth/start", {
        method: "POST",
        json: { provider, name, rootFolder, folderTemplate },
      })
      window.location.assign(url)
    } catch (err) {
      toastManager.add({
        title: "Couldn't start",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
      setPending(false)
    }
  }

  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        Connect {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent
          title={`Connect ${label}`}
          description={STORAGE_PROVIDER_INFO[provider].help}
        >
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <Input
              label="Name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Top folder"
              value={rootFolder}
              maxLength={100}
              description="Sahihi creates it and puts every envelope's folder inside."
              onChange={(e) => setRootFolder(e.target.value)}
            />
            <Input
              label="Folder for each envelope"
              value={folderTemplate}
              description="Use {yyyy}, {mm}, {dd}, {title} and {id}."
              onChange={(e) => setFolderTemplate(e.target.value)}
            />
            <DialogActions>
              <Button
                variant="ghost"
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Continue to {label}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
