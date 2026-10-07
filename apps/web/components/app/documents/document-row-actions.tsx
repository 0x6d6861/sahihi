"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { MoveToFolderDialog } from "@/components/app/folders/move-to-folder-dialog"
import { FileTextIcon, FolderInputIcon, PencilIcon, SendIcon } from "@/components/app/icons"
import { EditItemDialog } from "@/components/app/labels/edit-item-dialog"
import { toastManager } from "@/components/app/toast"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { api } from "@/lib/api"
import type { TagRef } from "@/lib/labels"

/**
 * Row menu on the Documents list: open, send, and "Edit…" (name, color, tags) / "Move to…" when the
 * caller may change the document.
 */
export function DocumentRowActions({
  document,
  allTags,
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
}) {
  const router = useRouter()
  const [moving, setMoving] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <DropdownMenu
        label="Actions"
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
