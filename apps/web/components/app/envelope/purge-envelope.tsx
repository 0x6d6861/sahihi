"use client"

import { EraserIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import { api } from "@/lib/api"

/** Owner/admin: delete a closed envelope's files and personal data now (docs/data-retention.md). */
export function PurgeEnvelope({ envelopeId }: { envelopeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function purge() {
    setBusy(true)
    try {
      await api(`/envelopes/${envelopeId}/purge`, { method: "POST" })
      setOpen(false)
      toastManager.add({
        title: "Deleting files and personal data",
        description: "This takes a few seconds; refresh to see the result.",
        type: "success",
      })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not deleted",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger render={<Button variant="destructive-outline" />}>
        <EraserIcon aria-hidden />
        Delete data
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this envelope's files and personal data?</AlertDialogTitle>
          <AlertDialogDescription>
            The PDFs, signatures, recipients' names, emails and phone numbers, and field values are
            deleted. The status, hashes, certificate code and audit trail are kept as evidence.
            Recipients can no longer download their copies. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" disabled={busy} />}>
            Cancel
          </AlertDialogClose>
          <Button variant="destructive" onClick={purge} disabled={busy}>
            {busy && <Spinner aria-hidden />}
            Delete data
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
