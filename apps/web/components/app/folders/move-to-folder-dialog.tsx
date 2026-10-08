"use client"

import { useEffect, useMemo, useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { DIALOG_WITH_POPOVERS, RevealPopovers } from "@/components/app/dialog-popovers"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Combobox } from "@/components/arc/combobox/combobox"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { api } from "@/lib/api"
import { folderPathLabel } from "@/lib/documents-list"

interface FolderOption {
  id: string
  name: string
  parentId: string | null
  path: { id: string; name: string }[]
}

const ROOT = "__root__"

/**
 * Pick a destination folder (or the top level) for a document, envelope, template or folder
 * (ADR 0038). Loads the workspace's
 * folders when opened. For a folder, its own subtree is left out (the API refuses it anyway).
 */
export function MoveToFolderDialog({
  open,
  onOpenChange,
  itemName,
  title = `Move “${itemName}”`,
  currentFolderId,
  excludeSubtreeOf,
  onMove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  /** Defaults to Move “name”; several items (ADR 0039) say "Move 3 items". */
  title?: string
  /**
   * Where the item is now (null = top level); preselected and not a valid target. `undefined`
   * for items from several folders: the top level is preselected and any folder may be picked.
   */
  currentFolderId: string | null | undefined
  /** Folders that can't take the item: these and everything under them. */
  excludeSubtreeOf?: string | readonly string[]
  /** `folderName` is the destination's own name (the top level's is "the top level"). */
  onMove: (folderId: string | null, folderName: string) => Promise<void>
}) {
  const here = currentFolderId === undefined ? null : (currentFolderId ?? ROOT)
  const [folders, setFolders] = useState<FolderOption[] | null>(null)
  const [target, setTarget] = useState<string>(currentFolderId ?? ROOT)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTarget(currentFolderId ?? ROOT)
    let cancelled = false
    api<{ items: FolderOption[] }>("/folders?all=1")
      .then((r) => !cancelled && setFolders(r.items))
      .catch(() => !cancelled && setFolders([]))
    return () => {
      cancelled = true
    }
  }, [open, currentFolderId])

  const items = useMemo(() => {
    const excluded =
      typeof excludeSubtreeOf === "string" ? [excludeSubtreeOf] : (excludeSubtreeOf ?? [])
    const options = (folders ?? [])
      .filter((f) => !f.path.some((p) => excluded.includes(p.id)))
      .map((f) => ({ value: f.id, label: folderPathLabel(f.path) }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return [{ value: ROOT, label: "Top level (no folder)" }, ...options]
  }, [folders, excludeSubtreeOf])

  async function move() {
    setBusy(true)
    try {
      const folder = folders?.find((f) => f.id === target)
      await onMove(folder ? folder.id : null, folder?.name ?? "the top level")
      onOpenChange(false)
    } catch (err) {
      toastManager.add({
        title: "Not moved",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title={title}
        description="Folders only organise your work; signing and certificates aren't affected."
        // Room for the Combobox's list (it would be cut off at the dialog's edge).
        className={DIALOG_WITH_POPOVERS}
      >
        <RevealPopovers>
          <div className="flex flex-col gap-4">
            {/* A workspace can have many folders: Combobox filters as you type. */}
            <Combobox
              label="Destination"
              options={items}
              value={target}
              onValueChange={(v) => setTarget(v || ROOT)}
              disabled={folders === null}
              placeholder="Search folders"
            />
            <DialogActions>
              <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button onClick={move} loading={busy} disabled={folders === null || target === here}>
                Move
              </Button>
            </DialogActions>
          </div>
        </RevealPopovers>
      </DialogContent>
    </Dialog>
  )
}
