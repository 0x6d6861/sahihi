"use client"

import { useRouter } from "next/navigation"
import { EllipsisVerticalIcon, FileTextIcon, PencilIcon, SendIcon } from "@/components/app/icons"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"

/**
 * The ⋮ menu on an envelope row or card (ADR 0034, 0036): open it (a draft the caller may edit
 * opens in the editor) and open its document. State changes (send, void, remind…) stay on the
 * envelope page, where they can be explained and confirmed.
 */
export function EnvelopeRowActions({
  envelope,
}: {
  envelope: {
    id: string
    title: string
    status: string
    document: { id: string }
    permissions: { manage: boolean }
  }
}) {
  const router = useRouter()
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
  ]
  return (
    <DropdownMenu
      label={`Actions for ${envelope.title}`}
      iconOnly
      icon={<EllipsisVerticalIcon />}
      items={items}
    />
  )
}
