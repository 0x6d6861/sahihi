"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { MoveToFolderDialog } from "@/components/app/folders/move-to-folder-dialog"
import {
  EllipsisVerticalIcon,
  FileTextIcon,
  FolderInputIcon,
  PencilIcon,
  SendIcon,
  SparklesIcon,
} from "@/components/app/icons"
import { EditItemDialog } from "@/components/app/labels/edit-item-dialog"
import { toastManager } from "@/components/app/toast"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { api } from "@/lib/api"
import { importErrorMessage } from "@/lib/generator"
import type { TagRef } from "@/lib/labels"

/**
 * Row menu on the Documents list: open, send, draft from it with the assistant (ADR 0049), and
 * "Edit…" (name, color, tags) / "Move to…" when the caller may change the document.
 */
export function DocumentRowActions({
  document,
  allTags,
  compact = false,
}: {
  document: {
    id: string
    name: string
    status: string
    folderId: string | null
    /** `#RRGGBB` label colour. */
    color: string | null
    tags: TagRef[]
    permissions: { move: boolean; label: boolean; rename: boolean }
  }
  /** Every tag in use in the workspace, for the tag picker. */
  allTags: TagRef[]
  /** A round ⋮ trigger instead of "Actions", for grid cards (ADR 0034). */
  compact?: boolean
}) {
  const router = useRouter()
  const [moving, setMoving] = useState(false)
  const [editing, setEditing] = useState(false)

  // Its text, word for word, as a new draft in Drafting; the PDF itself doesn't change.
  async function draftFrom() {
    const toast = toastManager.add({ title: `Importing “${document.name}”…`, type: "loading" })
    try {
      const { id } = await api<{ id: string }>("/generated-documents", {
        method: "POST",
        json: { documentId: document.id },
      })
      if (toast) toastManager.close(toast)
      router.push(`/generate/${id}`)
    } catch (err) {
      const failed = { title: "Not imported", description: importErrorMessage(err) } as const
      if (toast) toastManager.update(toast, { ...failed, type: "error" })
      else toastManager.add({ ...failed, type: "error" })
    }
  }

  return (
    <>
      <DropdownMenu
        label={compact ? `Actions for ${document.name}` : "Actions"}
        iconOnly={compact}
        icon={compact ? <EllipsisVerticalIcon /> : undefined}
        items={[
          {
            label: "Open",
            icon: <FileTextIcon />,
            onSelect: () => router.push(`/documents/${document.id}`),
          },
          ...(document.status === "READY"
            ? [
                {
                  label: "Create envelope",
                  icon: <SendIcon />,
                  onSelect: () =>
                    router.push(`/envelopes/new?documentId=${encodeURIComponent(document.id)}`),
                } satisfies DropdownItem,
                {
                  label: "Draft from this document",
                  icon: <SparklesIcon />,
                  onSelect: () => void draftFrom(),
                } satisfies DropdownItem,
              ]
            : []),
          ...(document.permissions.label
            ? [
                {
                  label: "Edit…",
                  icon: <PencilIcon />,
                  onSelect: () => setEditing(true),
                } satisfies DropdownItem,
              ]
            : []),
          ...(document.permissions.move
            ? [
                {
                  label: "Move to…",
                  icon: <FolderInputIcon />,
                  onSelect: () => setMoving(true),
                } satisfies DropdownItem,
              ]
            : []),
        ]}
      />
      {document.permissions.label && (
        <EditItemDialog
          open={editing}
          onOpenChange={setEditing}
          kind="document"
          name={document.name}
          renameLocked={
            document.permissions.rename
              ? undefined
              : "Sent for signature, so the name is fixed: signers and the certificate show it."
          }
          color={document.color}
          tags={document.tags}
          suggestions={allTags}
          onSubmit={async (changes) => {
            await api(`/documents/${document.id}`, { method: "PATCH", json: changes })
            toastManager.add({ title: "Document saved", type: "success" })
            router.refresh()
          }}
        />
      )}
      {document.permissions.move && (
        <MoveToFolderDialog
          open={moving}
          onOpenChange={setMoving}
          itemName={document.name}
          currentFolderId={document.folderId}
          onMove={async (folderId) => {
            await api(`/documents/${document.id}`, { method: "PATCH", json: { folderId } })
            toastManager.add({ title: `Moved “${document.name}”`, type: "success" })
            router.refresh()
          }}
        />
      )}
    </>
  )
}
