"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EllipsisVerticalIcon, FilePenLineIcon, MailIcon, Trash2Icon } from "@/components/app/icons"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { ApiError, api } from "@/lib/api"

/**
 * The ⋮ menu on a row of "Your drafts" (/generate): open it, open its envelope once finalised, and
 * delete it while it's still a draft, for whoever may edit it (`DELETE /generated-documents/:id`).
 * A finalised one stays: it goes when its envelope is purged.
 */
export function DraftRowActions({
  draft,
}: {
  draft: {
    id: string
    title: string
    status: "DRAFT" | "FINALIZED"
    envelopeId: string | null
    canEdit: boolean
  }
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canDelete = draft.canEdit && draft.status === "DRAFT"
  return (
    <>
      <DropdownMenu
        label={`Actions for “${draft.title}”`}
        iconOnly
        icon={<EllipsisVerticalIcon />}
        items={[
          {
            label: "Open",
            icon: <FilePenLineIcon />,
            onSelect: () => router.push(`/generate/${draft.id}`),
          },
          ...(draft.envelopeId
            ? [
                {
                  label: "Open envelope",
                  icon: <MailIcon />,
                  onSelect: () => router.push(`/envelopes/${draft.envelopeId}`),
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  label: "Delete",
                  icon: <Trash2Icon />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => setDeleting(true),
                },
              ]
            : []),
        ]}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={(next) => {
          setDeleting(next)
          if (!next) setError(null)
        }}
        title={`Delete “${draft.title}”?`}
        description="The draft, its versions and the conversation with the assistant are deleted. This can't be undone."
        confirmLabel="Delete draft"
        onConfirm={async () => {
          setError(null)
          try {
            await api(`/generated-documents/${encodeURIComponent(draft.id)}`, { method: "DELETE" })
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
