"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { FolderIcon, FolderInputIcon, PencilIcon, Trash2Icon } from "@/components/app/icons"
import { EditItemDialog } from "@/components/app/labels/edit-item-dialog"
import { ColorDot, ColorName, TagBadges } from "@/components/app/labels/labels"
import { toastManager } from "@/components/app/toast"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { api } from "@/lib/api"
import { folderPathLabel } from "@/lib/documents-list"
import { pluralize } from "@/lib/format"
import type { TagRef } from "@/lib/labels"
import { MoveToFolderDialog } from "./move-to-folder-dialog"

/** "3 documents, 1 folder", only the parts that aren't zero; "Empty" when both are. */
function folderSummary(documents: number, folders: number): string {
  const parts = [
    documents > 0 ? pluralize(documents, "document") : null,
    folders > 0 ? pluralize(folders, "folder") : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "Empty"
}

export interface FolderCardData {
  id: string
  name: string
  documentCount: number
  folderCount: number
  /** `#RRGGBB` label colour. */
  color: string | null
  tags: TagRef[]
  /** Search results only: the parent's path (empty = top level). */
  path?: { id: string; name: string }[]
  permissions: { manage: boolean }
}

/**
 * A folder on the Documents page: opens it, with Edit (name, color, tags) / Move / Delete for whoever
 * may manage it. Deleting moves its contents up to `parentName` (ADR 0022). Under the summary, its
 * label colour as a dot and then its tags, on one line (ADR 0025).
 */
export function FolderCard({
  folder,
  href,
  parentId,
  parentName,
  allTags,
}: {
  folder: FolderCardData
  href: string
  parentId: string | null
  parentName: string
  /** Every tag in use in the workspace, for the tag picker. */
  allTags: TagRef[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    try {
      await api(`/folders/${folder.id}`, { method: "DELETE" })
      toastManager.add({ title: `Folder “${folder.name}” deleted`, type: "success" })
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

  const empty = folder.documentCount === 0 && folder.folderCount === 0

  return (
    <div className="relative flex min-h-16 items-center gap-3 rounded-xl border bg-card py-2.5 ps-4 pe-2.5 transition-colors has-[a:hover]:bg-muted has-[a:focus-visible]:bg-muted">
      <FolderIcon aria-hidden className="shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={href}
            title={folder.name}
            className="truncate font-medium after:absolute after:inset-0 after:rounded-xl"
          >
            {folder.name}
            <ColorName color={folder.color} />
          </Link>
          <p className="truncate text-muted-foreground text-xs tabular-nums">
            {folder.path
              ? `In ${folder.path.length > 0 ? folderPathLabel(folder.path) : "Documents"}`
              : folderSummary(folder.documentCount, folder.folderCount)}
          </p>
        </div>
        {/* Label line: the colour dot, then the tags. */}
        {(folder.color || folder.tags.length > 0) && (
          <div className="flex min-w-0 items-center gap-1.5">
            {folder.color && <ColorDot color={folder.color} className="size-2.5" />}
            <TagBadges tags={folder.tags} />
          </div>
        )}
      </div>
      {folder.permissions.manage && (
        <>
          {/* Above the card-wide link overlay, so the trigger stays clickable. */}
          <div className="relative z-10">
            <DropdownMenu
              label="Actions"
              items={[
                { label: "Edit…", icon: <PencilIcon />, onSelect: () => setEditing(true) },
                { label: "Move to…", icon: <FolderInputIcon />, onSelect: () => setMoving(true) },
                {
                  label: "Delete",
                  icon: <Trash2Icon />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => setDeleting(true),
                },
              ]}
            />
          </div>

          <EditItemDialog
            open={editing}
            onOpenChange={setEditing}
            kind="folder"
            name={folder.name}
            color={folder.color}
            tags={folder.tags}
            suggestions={allTags}
            onSubmit={async (changes) => {
              await api(`/folders/${folder.id}`, { method: "PATCH", json: changes })
              toastManager.add({ title: "Folder saved", type: "success" })
              router.refresh()
            }}
          />

          <MoveToFolderDialog
            open={moving}
            onOpenChange={setMoving}
            itemName={folder.name}
            currentFolderId={parentId}
            excludeSubtreeOf={folder.id}
            onMove={async (target) => {
              await api(`/folders/${folder.id}`, { method: "PATCH", json: { parentId: target } })
              toastManager.add({ title: `Moved “${folder.name}”`, type: "success" })
              router.refresh()
            }}
          />

          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`Delete folder “${folder.name}”?`}
            description={
              empty
                ? "The folder is empty."
                : `Its ${pluralize(folder.documentCount, "document")} and ${pluralize(folder.folderCount, "subfolder")} move to ${parentName}. No documents are deleted.`
            }
            confirmLabel="Delete folder"
            onConfirm={remove}
          />
        </>
      )}
    </div>
  )
}
