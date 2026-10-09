"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { ApiError, api } from "@/lib/api"
import { useGenerator } from "./generator-context"

/**
 * Finalise (docs/ai-documents.md → Finalise): render the reviewed version to a PDF and open its
 * DRAFT envelope in the editor, signers and fields in place. Needs a clean preflight and the
 * person's confirmation that they reviewed an AI-drafted document.
 */
export function FinalizeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { detail } = useGenerator()
  const [reviewed, setReviewed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finalize = async () => {
    setError(null)
    try {
      const { envelopeId } = await api<{ envelopeId: string }>(
        `/generated-documents/${encodeURIComponent(detail.document.id)}/finalize`,
        { method: "POST", json: { versionId: detail.version.id, acknowledged: true } },
      )
      router.push(`/envelopes/${encodeURIComponent(envelopeId)}/edit`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't finalise. Try again.")
      throw err
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setError(null)
      }}
      title="Finalise and prepare to send"
      description="This creates the PDF and a draft envelope with the signers and their fields. The document can't change after this."
      confirmLabel="Finalise"
      tone="primary"
      disabled={!reviewed}
      onConfirm={finalize}
    >
      <div className="flex flex-col gap-3">
        <Checkbox
          checked={reviewed}
          onCheckedChange={(v) => setReviewed(v === true)}
          label="I've read the whole document"
          description="It was drafted with an AI assistant and isn't legal advice."
        />
        {error && (
          <p className="text-destructive-foreground text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  )
}
