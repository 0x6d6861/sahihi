"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ButtonLink } from "@/components/app/button-link"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/arc/button/button"
import { ApiError, api } from "@/lib/api"
import { useGenerator } from "./generator-context"

/**
 * A finalised document can't change (docs/ai-documents.md → New versions). This starts a new
 * draft from it, with the same text, answers and signers, or opens the one already started.
 */
export function NewVersionAction() {
  const router = useRouter()
  const { detail } = useGenerator()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (detail.document.newVersionId) {
    return (
      <ButtonLink href={`/generate/${encodeURIComponent(detail.document.newVersionId)}`}>
        Open new version
      </ButtonLink>
    )
  }
  if (!detail.document.canEdit) return null
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Start a new version
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setError(null)
        }}
        title="Start a new version?"
        description="A new draft with this text, its answers and signers, to change and finalise again. This document and its envelope stay as they are: void the envelope, or delete it if it's still a draft, once the new version replaces it."
        confirmLabel="Start new version"
        tone="primary"
        onConfirm={async () => {
          setError(null)
          try {
            const { id } = await api<{ id: string }>(
              `/generated-documents/${encodeURIComponent(detail.document.id)}/new-version`,
              { method: "POST" },
            )
            router.push(`/generate/${encodeURIComponent(id)}`)
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't start it. Try again.")
            throw err
          }
        }}
      >
        {error && (
          <p className="text-destructive-foreground text-sm" role="alert">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </>
  )
}
