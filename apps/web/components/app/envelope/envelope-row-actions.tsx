"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  EllipsisVerticalIcon,
  FileTextIcon,
  FolderInputIcon,
  PencilIcon,
  SendIcon,
  TagIcon,
} from "@/components/app/icons"
import { ItemLabelDialogs } from "@/components/app/labels/item-label-dialogs"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import type { TagRef } from "@/lib/labels"

/**
 * The ⋮ menu on an envelope row or card (ADR 0034, 0036): open it (a draft the caller may edit
 * opens in the editor) and open its document; "Edit labels…" and "Move to…" for whoever may manage
 * it (ADR 0038). State changes (send, void, remind…) stay on the envelope page, where they can be
 * explained and confirmed.
 */
export function EnvelopeRowActions({
  envelope,
  allTags,
}: {
  envelope: {
    id: string
    title: string
    status: string
    document: { id: string }
    folderId: string | null
    color: string | null
    tags: TagRef[]
    permissions: { manage: boolean }
  }
  /** Every tag in use in the workspace, for the tag picker. */
  allTags: TagRef[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const draft = envelope.status === "DRAFT" && envelope.permissions.manage
  const items: DropdownItem[] = [
    draft
      ? {
          label: "Continue editing",
          icon: <PencilIcon />,
          onSelect: () => router.push(`/envelopes/${envelope.id}/edit`),
        }
      : {
          label: "Open",
          icon: <SendIcon />,
          onSelect: () => router.push(`/envelopes/${envelope.id}`),
        },
    {
      label: "Open document",
      icon: <FileTextIcon />,
      onSelect: () => router.push(`/documents/${envelope.document.id}`),
    },
    ...(envelope.permissions.manage
      ? ([
          {
            label: "Edit labels…",
            icon: <TagIcon />,
            separatorBefore: true,
            onSelect: () => setEditing(true),
          },
          { label: "Move to…", icon: <FolderInputIcon />, onSelect: () => setMoving(true) },
        ] satisfies DropdownItem[])
      : []),
  ]
  return (
    <>
      <DropdownMenu
        label={`Actions for ${envelope.title}`}
        iconOnly
        icon={<EllipsisVerticalIcon />}
        items={items}
      />
      {envelope.permissions.manage && (
        <ItemLabelDialogs
          kind="envelope"
          item={{ ...envelope, name: envelope.title }}
          allTags={allTags}
          editing={editing}
          onEditingChange={setEditing}
          moving={moving}
          onMovingChange={setMoving}
        />
      )}
    </>
  )
}
