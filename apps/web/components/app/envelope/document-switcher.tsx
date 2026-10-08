"use client"

import type { ReactNode } from "react"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { documentTabLabel } from "@/lib/envelope-documents"

/**
 * Which of an envelope's documents is on screen (ADR 0037): an Arc segmented control, one segment
 * per document in signing order. With many documents it scrolls sideways inside itself. Hidden
 * when there is only one document.
 */
export function DocumentSwitcher({
  documents,
  value,
  onValueChange,
  accessory,
}: {
  documents: { id: string; name: string }[]
  value: string
  onValueChange: (id: string) => void
  /** After a document's name, e.g. how many fields are left on it. */
  accessory?: (id: string) => ReactNode
}) {
  if (documents.length < 2) return null
  return (
    <div className="-mx-1 min-w-0 overflow-x-auto px-1">
      <SegmentedControl
        label="Documents"
        value={value}
        onValueChange={onValueChange}
        options={documents.map((d, i) => ({
          value: d.id,
          label: documentTabLabel(i, d.name),
          accessory: accessory?.(d.id),
        }))}
      />
    </div>
  )
}
