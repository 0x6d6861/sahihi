"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EraserIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { api } from "@/lib/api"

/** Owner/admin: delete a closed envelope's files and personal data now (docs/data-retention.md). */
export function PurgeEnvelope({ envelopeId }: { envelopeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function purge() {
    try {
      await api(`/envelopes/${envelopeId}/purge`, { method: "POST" })
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
      throw err
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <EraserIcon aria-hidden />
        Delete data
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this envelope's files and personal data?"
        description="The PDFs, signatures, recipients' names, emails and phone numbers, and field values are deleted. The status, hashes, certificate code and audit trail are kept as evidence. Recipients can no longer download their copies. This can't be undone."
        confirmLabel="Delete data"
        onConfirm={purge}
      />
    </>
  )
}
