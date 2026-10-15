"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/app/button"
import { ConfirmDialog, DialogActions } from "@/components/app/confirm-dialog"
import { Alert } from "@/components/arc/alert/alert"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { ApiError, api } from "@/lib/api"
import { issueTarget } from "@/lib/generator"
import { useGenerator } from "./generator-context"

/**
 * Finalise (docs/ai-documents.md → Finalise): render the reviewed version to a PDF and open its
 * DRAFT envelope in the editor, signers and fields in place. Needs a clean preflight and the
 * person's confirmation that they reviewed an AI-drafted document. While the preflight finds
 * problems, the dialog lists them instead, each with a link to where it's fixed.
 */
export function FinalizeDialog({
  open,
  onOpenChange,
  saveFailed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A pending edit couldn't be saved before opening: what's on screen isn't what would render. */
  saveFailed: boolean
}) {
  const { detail } = useGenerator()
  if (saveFailed || detail.issues.length > 0) {
    return <FixFirst open={open} onOpenChange={onOpenChange} saveFailed={saveFailed} />
  }
  return <Confirm open={open} onOpenChange={onOpenChange} />
}

function FixFirst({
  open,
  onOpenChange,
  saveFailed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saveFailed: boolean
}) {
  const { detail, navigate } = useGenerator()
  const count = detail.issues.length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Before you finalise"
        description={
          count > 0
            ? `${count} ${count === 1 ? "thing needs" : "things need"} fixing first.`
            : undefined
        }
      >
        <div className="flex flex-col gap-3">
          {saveFailed && (
            <Alert tone="danger" title="Some edits aren't saved">
              Retry the save in the document or the Signers tab, then finalise again.
            </Alert>
          )}
          {count > 0 && (
            <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-xl border">
              {detail.issues.map((issue) => {
                const target = issueTarget(issue)
                return (
                  <li
                    key={`${issue.code}:${issue.variableKey ?? issue.roleKey ?? issue.message}`}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 text-sm">{issue.message}</span>
                    {target && (
                      <span className="shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onOpenChange(false)
                            navigate(target)
                          }}
                        >
                          {target.kind === "blank" ? "Fill in" : "Open signers"}
                        </Button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <DialogActions>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}

function Confirm({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
