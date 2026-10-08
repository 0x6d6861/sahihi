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
  currentFolderId,
  excludeSubtreeOf,
  onMove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  /** Where the item is now (null = top level); preselected and not a valid target. */
  currentFolderId: string | null
  excludeSubtreeOf?: string
  onMove: (folderId: string | null) => Promise<void>
}) {
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
    const options = (folders ?? [])
      .filter((f) => !excludeSubtreeOf || !f.path.some((p) => p.id === excludeSubtreeOf))
      .map((f) => ({ value: f.id, label: folderPathLabel(f.path) }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return [{ value: ROOT, label: "Top level (no folder)" }, ...options]
  }, [folders, excludeSubtreeOf])

  async function move() {
    setBusy(true)
    try {
      await onMove(target === ROOT ? null : target)
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
        title={`Move “${itemName}”`}
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
              <Button
                onClick={move}
                loading={busy}
                disabled={folders === null || target === (currentFolderId ?? ROOT)}
              >
                Move
              </Button>
            </DialogActions>
          </div>
        </RevealPopovers>
      </DialogContent>
    </Dialog>
  )
}
