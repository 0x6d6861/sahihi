"use client"

import { useState } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { cn } from "@/lib/utils"

/** Right-aligned action row at the bottom of an Arc dialog. */
export function DialogActions({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end", className)}>
      {children}
    </div>
  )
}

/**
 * A decision whose consequence needs explaining (Arc `dialog`). The confirm button shows its own
 * pending state; `onConfirm` throws to keep the dialog open (the caller reports the error).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  disabled,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: "danger" | "primary"
  disabled?: boolean
  onConfirm: () => Promise<void> | void
  children?: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // The caller reported it; stay open so the user can retry or cancel.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent title={title} description={description}>
        {children}
        <DialogActions>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={tone} loading={busy} disabled={disabled} onClick={confirm}>
            {confirmLabel}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}
