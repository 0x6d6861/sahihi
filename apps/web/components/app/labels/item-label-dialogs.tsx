"use client"

import { useRouter } from "next/navigation"
import { MoveToFolderDialog } from "@/components/app/folders/move-to-folder-dialog"
import { toastManager } from "@/components/app/toast"
import { api } from "@/lib/api"
import type { TagRef } from "@/lib/labels"
import { EditItemDialog } from "./edit-item-dialog"

/** An envelope or template as its folder and label dialogs need it (ADR 0038). */
export interface LabeledItem {
  id: string
  name: string
  folderId: string | null
  color: string | null
  tags: TagRef[]
}

const ENDPOINT = {
  // Folder and labels only: an envelope's title changes in the editor, before it's sent.
  envelope: (id: string) => `/envelopes/${id}/labels`,
  template: (id: string) => `/templates/${id}`,
}

const NOUN = { envelope: "Envelope", template: "Template" }

/**
 * "Edit…" (name, color, tags) and "Move to…" for an envelope or a template (ADR 0038), the same
 * dialogs as documents and folders. The menu that opens them owns the open state. An envelope's
 * title can't change here: drafts rename it in the editor, and a sent one's title is evidence.
 */
export function ItemLabelDialogs({
  kind,
  item,
  allTags,
  editing,
  onEditingChange,
  moving,
  onMovingChange,
}: {
  kind: "envelope" | "template"
  item: LabeledItem
  /** Every tag in use in the workspace, for the tag picker. */
  allTags: TagRef[]
  editing: boolean
  onEditingChange: (open: boolean) => void
  moving: boolean
  onMovingChange: (open: boolean) => void
}) {
  const router = useRouter()
  const endpoint = ENDPOINT[kind](item.id)
  return (
    <>
      <EditItemDialog
        open={editing}
        onOpenChange={onEditingChange}
        kind={kind}
        name={item.name}
        renameLocked={
          kind === "envelope"
            ? "Change a draft's title in the editor. Once sent, signers and the certificate show it."
            : undefined
        }
        color={item.color}
        tags={item.tags}
        suggestions={allTags}
        onSubmit={async (changes) => {
          await api(endpoint, { method: "PATCH", json: changes })
          toastManager.add({ title: `${NOUN[kind]} saved`, type: "success" })
          router.refresh()
        }}
      />
      <MoveToFolderDialog
        open={moving}
        onOpenChange={onMovingChange}
        itemName={item.name}
        currentFolderId={item.folderId}
        onMove={async (folderId) => {
          await api(endpoint, { method: "PATCH", json: { folderId } })
          toastManager.add({ title: `Moved “${item.name}”`, type: "success" })
          router.refresh()
        }}
      />
    </>
  )
}
