import { ListCard } from "@/components/app/list-card"
import { Person } from "@/components/app/people"
import { TemplateRowActions } from "@/components/app/templates/template-row-actions"
import { TemplateTypeIcon } from "@/components/app/type-icons"
import { formatDate, formatDateTime, pluralize } from "@/lib/format"

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
  permissions: { manage: boolean }
}

/** A template in the Templates grid (ADR 0036): opening it means using it. */
export function TemplateCard({ template: t }: { template: TemplateItem }) {
  return (
    <ListCard
      href={`/templates/${t.id}/use`}
      title={t.name}
      icon={<TemplateTypeIcon />}
      menu={
        <TemplateRowActions
          template={{ id: t.id, name: t.name, description: t.description }}
          canManage={t.permissions.manage}
        />
      }
      thumbnailUrl={t.thumbnailUrl}
      documentCount={t.documents.length}
      footer={
        <>
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
