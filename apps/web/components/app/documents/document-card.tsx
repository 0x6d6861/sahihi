import type { DocumentStatus } from "@sahihi/core"
import { DocumentRowActions } from "@/components/app/documents/document-row-actions"
import { DocumentTypeIcon } from "@/components/app/documents/document-type-icon"
import { ColorDot, ColorName } from "@/components/app/labels/labels"
import { ListCard } from "@/components/app/list-card"
import { Person } from "@/components/app/people"
import { DocumentStatusIcon } from "@/components/app/status-icon"
import { formatDate, formatDateTime } from "@/lib/format"
import type { TagRef } from "@/lib/labels"

export interface DocumentCardData {
  id: string
  name: string
  status: DocumentStatus
  createdAt: string
  /** Presigned, cacheable; null until the worker has rendered it (ADR 0033). */
  thumbnailUrl: string | null
  uploadedBy: { name: string; image?: string | null }
  folder: { name: string } | null
  folderId: string | null
  color: string | null
  tags: TagRef[]
  permissions: { move: boolean; label: boolean; rename: boolean }
}

/**
 * A document in the Documents grid, in the manner of a file tile in Google Drive (ADR 0033, 0034):
 * a tonal card with no border; a title row (file-type icon, name, ⋮ menu); the top of the first
 * page, cropped to a landscape window; and one quiet meta line. The whole card opens the document;
 * the menu sits above the stretched link. Hover darkens the card's tone.
 */
export function DocumentCard({
  document: d,
  searching,
  allTags,
}: {
  document: DocumentCardData
  /** Search spans every folder, so say where each result lives. */
  searching: boolean
  allTags: TagRef[]
}) {
  return (
    <ListCard
      href={`/documents/${d.id}`}
      title={d.name}
      titleExtra={<ColorName color={d.color} />}
      icon={<DocumentTypeIcon status={d.status} />}
      menu={<DocumentRowActions document={d} allTags={allTags} compact />}
      thumbnailUrl={d.thumbnailUrl}
      footer={
        <>
          {d.color && <ColorDot color={d.color} className="size-2" />}
          {/* Ready is the normal state; anything else shows its status icon. */}
          {d.status !== "READY" && <DocumentStatusIcon status={d.status} />}
          <Person person={d.uploadedBy} nameHidden />
          <p className="min-w-0 truncate tabular-nums">
            <time dateTime={d.createdAt} title={formatDateTime(d.createdAt)}>
              {formatDate(d.createdAt)}
            </time>
            {searching && d.folder ? ` · In ${d.folder.name}` : ""}
          </p>
        </>
      }
    />
  )
}
