"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { FolderPlusIcon } from "@/components/app/icons"
import { EditItemDialog } from "@/components/app/labels/edit-item-dialog"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { api } from "@/lib/api"
import type { TagRef } from "@/lib/labels"

// Stable, so the dialog's reset-on-open effect doesn't rerun on every render.
const NO_TAGS: TagRef[] = []

/**
 * "Create folder" in the open folder (`parentId`), or at the root: name, color and tags in one
 * dialog. `appearance="ghost"` is a dashed placeholder card the size of a folder card, shown where
 * folders would be when there are none.
 */
export function CreateFolderButton({
  parentId,
  allTags,
  appearance = "button",
}: {
  parentId?: string
  /** Every tag in use in the workspace, for the tag picker. */
  allTags: TagRef[]
  appearance?: "button" | "ghost"
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      {appearance === "ghost" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed py-2.5 ps-4 pe-2.5 text-start text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FolderPlusIcon aria-hidden className="shrink-0" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium text-foreground">New folder</span>
            <span className="truncate text-xs">Group documents by client, team or project</span>
          </span>
        </button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <FolderPlusIcon aria-hidden />
          Create folder
        </Button>
      )}
      <EditItemDialog
        open={open}
        onOpenChange={setOpen}
        kind="folder"
        mode="create"
        name=""
        color={null}
        tags={NO_TAGS}
        suggestions={allTags}
        onSubmit={async ({ name, color, tags }) => {
          await api("/folders", { method: "POST", json: { name, parentId, color, tags } })
          toastManager.add({ title: `Folder “${name}” created`, type: "success" })
          router.refresh()
        }}
      />
    </>
  )
}
