import { ColorDot, ColorName } from "@/components/app/labels/labels"
import { ListCard } from "@/components/app/list-card"
import { Person } from "@/components/app/people"
import { TemplateRowActions } from "@/components/app/templates/template-row-actions"
import { TemplateTypeIcon } from "@/components/app/type-icons"
import { formatDate, formatDateTime, pluralize } from "@/lib/format"
import type { TagRef } from "@/lib/labels"

export interface TemplateItem {
  id: string
  name: string
  description: string | null
  createdAt: string
  /** The first document (ADR 0037). */
  document: { id: string; name: string; pageCount: number }
  documents: { id: string; name: string; pageCount: number | null }[]
  /** First page of the template's document (ADR 0033); null until rendered. */
  thumbnailUrl: string | null
  createdBy: { id: string; name: string; image: string | null }
  roles: { label: string; role: string }[]
  _count: { fields: number }
  /** Folder and labels (ADR 0038). */
  folderId: string | null
  folder: { id: string; name: string } | null
  color: string | null
  tags: TagRef[]
  permissions: { manage: boolean }
}

/** A template in the Templates grid (ADR 0036): opening it means using it. */
export function TemplateCard({
  template: t,
  allTags,
}: {
  template: TemplateItem
  /** Every tag in use in the workspace, for the tag picker. */
  allTags: TagRef[]
}) {
  return (
    <ListCard
      href={`/templates/${t.id}/use`}
      title={t.name}
      titleExtra={<ColorName color={t.color} />}
      icon={<TemplateTypeIcon />}
      menu={<TemplateRowActions template={t} canManage={t.permissions.manage} allTags={allTags} />}
      thumbnailUrl={t.thumbnailUrl}
      documentCount={t.documents.length}
      footer={
        <>
          {t.color && <ColorDot color={t.color} className="size-2" />}
          <Person person={t.createdBy} nameHidden />
          <span className="min-w-0 truncate">
            {pluralize(t.roles.length, "role")} · {pluralize(t._count.fields, "field")}
          </span>
          <time
            className="ms-auto shrink-0 tabular-nums"
            dateTime={t.createdAt}
            title={formatDateTime(t.createdAt)}
          >
            {formatDate(t.createdAt)}
          </time>
        </>
      }
    />
  )
}
