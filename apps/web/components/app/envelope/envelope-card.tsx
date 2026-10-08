import type { EnvelopeStatus } from "@sahihi/core"
import { EnvelopeRowActions } from "@/components/app/envelope/envelope-row-actions"
import { ColorDot, ColorName } from "@/components/app/labels/labels"
import { ListCard } from "@/components/app/list-card"
import { People } from "@/components/app/people"
import { ProgressRing } from "@/components/app/progress-ring"
import { EnvelopeStatusIcon } from "@/components/app/status-icon"
import { EnvelopeTypeIcon } from "@/components/app/type-icons"
import { signingProgress } from "@/lib/envelope-list"
import { formatDate, formatDateTime } from "@/lib/format"
import type { TagRef } from "@/lib/labels"

export interface EnvelopeItem {
  id: string
  title: string
  status: EnvelopeStatus
  createdAt: string
  /** The first document (ADR 0037). */
  document: { id: string; name: string }
  documents: { id: string; name: string }[]
  /** First page of the envelope's document (ADR 0033); null until rendered. */
  thumbnailUrl: string | null
  recipients: { id: string; name: string; status: string; role: string }[]
  createdBy: { id: string; name: string; image: string | null }
  /** Folder and labels (ADR 0038). */
  folderId: string | null
  folder: { id: string; name: string } | null
  color: string | null
  tags: TagRef[]
  permissions: { manage: boolean }
}

/**
 * An envelope in the Envelopes grid (ADR 0036): its document's first page, then status icon,
 * recipients' avatars, a signing-progress ring while it's out, and the date. A label colour shows
 * as a dot (ADR 0038).
 */
export function EnvelopeCard({
  envelope: e,
  allTags,
}: {
  envelope: EnvelopeItem
  /** Every tag in use in the workspace, for the tag picker. */
  allTags: TagRef[]
}) {
  const progress = signingProgress(e.recipients)
  return (
    <ListCard
      href={`/envelopes/${e.id}`}
      title={e.title}
      titleExtra={<ColorName color={e.color} />}
      icon={<EnvelopeTypeIcon />}
      menu={<EnvelopeRowActions envelope={e} allTags={allTags} />}
      thumbnailUrl={e.thumbnailUrl}
      documentCount={e.documents.length}
      footer={
        <>
          {e.color && <ColorDot color={e.color} className="size-2" />}
          <EnvelopeStatusIcon status={e.status} />
          {e.recipients.length > 0 && <People people={e.recipients} label="Recipients" max={3} />}
          {e.status !== "DRAFT" && progress.total > 0 && (
            <span className="flex items-center gap-1 tabular-nums">
              <ProgressRing
                value={progress.signed}
                max={progress.total}
                label={`${progress.signed} of ${progress.total} signed`}
                size={16}
              />
              <span aria-hidden>
                {progress.signed}/{progress.total}
              </span>
            </span>
          )}
          <time
            className="ms-auto shrink-0 tabular-nums"
            dateTime={e.createdAt}
            title={formatDateTime(e.createdAt)}
          >
            {formatDate(e.createdAt)}
          </time>
        </>
      }
    />
  )
}
