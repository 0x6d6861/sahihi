"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import {
  EllipsisVerticalIcon,
  FolderIcon,
  FolderInputIcon,
  PencilIcon,
  Trash2Icon,
} from "@/components/app/icons"
import { EditItemDialog } from "@/components/app/labels/edit-item-dialog"
import { ColorDot, ColorName, TagBadges } from "@/components/app/labels/labels"
import { toastManager } from "@/components/app/toast"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { api } from "@/lib/api"
import { folderMeta, folderSummary } from "@/lib/documents-list"
import type { TagRef } from "@/lib/labels"
import { MoveToFolderDialog } from "./move-to-folder-dialog"

export interface FolderCardData {
  id: string
  name: string
  documentCount: number
  /** What else it holds (ADR 0038). */
  envelopeCount?: number
  templateCount?: number
  folderCount: number
  /** `#RRGGBB` label colour. */
  color: string | null
  tags: TagRef[]
  /** Search results only: the parent's path (empty = top level). */
  path?: { id: string; name: string }[]
  createdAt?: string
  createdBy?: { id: string; name: string; image: string | null } | null
  permissions: { manage: boolean }
}

/**
 * A folder on a list page (ADR 0022, 0038): opens it, with Edit (name, color, tags) / Move / Delete for whoever
 * may manage it. Deleting moves its contents up to `parentName` (ADR 0022). Under the summary, its
 * label colour as a dot and then its tags, on one line (ADR 0025).
 */
export function FolderCard({
  folder,
  href,
  parentId,
  parentName,
  allTags,
  rootLabel = "Documents",
}: {
  folder: FolderCardData
  href: string
  parentId: string | null
  parentName: string
  /** Every tag in use in the workspace, for the tag picker. */
  allTags: TagRef[]
  /** The page's top level, for "In …" on search results. */
  rootLabel?: string
}) {
  return (
    <div className="relative flex min-h-16 items-center gap-3 rounded-xl border bg-card py-2.5 ps-4 pe-2.5 press-subtle has-[a:hover]:bg-muted has-[a:focus-visible]:bg-muted">
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
            {folderMeta(folder, rootLabel)}
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
      {/* Above the card-wide link overlay, so the trigger stays clickable. */}
      <div className="relative z-10">
        <FolderRowActions
          folder={folder}
          parentId={parentId}
          parentName={parentName}
          allTags={allTags}
        />
      </div>
    </div>
  )
}

/**
 * A folder's ⋮ menu with its dialogs (ADR 0022, 0034): Edit (name, color, tags), Move, Delete
 * (contents move up to `parentName`). Shared by the folder card and the folder row in the list.
 * Nothing for members who may not manage the folder.
 */
export function FolderRowActions({
  folder,
  parentId,
  parentName,
  allTags,
}: {
  folder: FolderCardData
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

  if (!folder.permissions.manage) return null
  const contents = folderSummary(folder)
  const empty = contents === "Empty"

  return (
    <>
      {/* A quiet ⋮ like the document cards (ADR 0034); the menu is the only way to edit,
              move or delete a folder, so it stays. */}
      <DropdownMenu
        label={`Actions for ${folder.name}`}
        iconOnly
        icon={<EllipsisVerticalIcon />}
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
            : `What's in it (${contents}) moves to ${parentName}. Nothing else is deleted.`
        }
        confirmLabel="Delete folder"
        onConfirm={remove}
      />
    </>
  )
}
