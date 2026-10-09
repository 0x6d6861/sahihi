"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Trash2Icon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { ApiError, api } from "@/lib/api"

/** Creates a document from a starter or a workspace template and opens it in the generator. */
export function StartDocument({ from }: { from: { starter: string } | { templateId: string } }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const { id } = await api<{ id: string }>("/generated-documents", {
              method: "POST",
              json: from,
            })
            router.push(`/generate/${id}`)
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't start. Try again.")
            setBusy(false)
          }
        }}
      >
        Start
      </Button>
      {error && <span className="text-destructive-foreground text-sm">{error}</span>}
    </div>
  )
}

/** Owners and admins: turn the assistant on for the workspace. */
export function EnableAssistant() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await api("/generated-documents/settings", { method: "PUT", json: { enabled: true } })
            router.refresh()
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't turn it on. Try again.")
          } finally {
            setBusy(false)
          }
        }}
      >
        Turn on for this workspace
      </Button>
      {error && <span className="text-destructive-foreground text-sm">{error}</span>}
    </div>
  )
}

/** Deletes a workspace template; documents started from it keep their text. */
export function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Tooltip content="Delete template">
        <IconButton
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete template ${name}`}
          onClick={() => setOpen(true)}
        >
          <Trash2Icon aria-hidden />
        </IconButton>
      </Tooltip>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setError(null)
        }}
        title={`Delete “${name}”?`}
        description="No one can start from it anymore. Documents already started from it stay as they are."
        confirmLabel="Delete template"
        onConfirm={async () => {
          setError(null)
          try {
            await api(`/generated-documents/templates/${encodeURIComponent(id)}`, {
              method: "DELETE",
            })
            router.refresh()
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't delete it. Try again.")
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
