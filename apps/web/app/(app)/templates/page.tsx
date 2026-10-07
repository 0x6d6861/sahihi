import { ButtonLink } from "@/components/app/button-link"
import { LayoutTemplateIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import type { TemplateRow } from "@/components/app/templates/template-row-actions"
import { BulkSendsTable, TemplatesTable } from "@/components/app/templates/templates-table"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { apiServer } from "@/lib/api-server"
import { formatDate, pluralize } from "@/lib/format"

interface TemplateListItem extends TemplateRow {
  document: { id: string; name: string; pageCount: number }
  createdBy: { name: string }
  roles: { label: string; role: string }[]
  _count: { fields: number }
  permissions: { manage: boolean }
  createdAt: string
}

export const metadata = { title: "Templates" }

/** Reusable envelopes of the active workspace (docs/templates.md). */
interface BulkSendListItem {
  id: string
  title: string
  status: "PENDING" | "RUNNING" | "DONE"
  total: number
  sent: number
  failed: number
  createdAt: string
  template: { name: string } | null
}

export default async function TemplatesPage() {
  const [{ data }, { data: bulk }] = await Promise.all([
    apiServer<{ items: TemplateListItem[] }>("/templates"),
    apiServer<{ items: BulkSendListItem[] }>("/bulk-sends"),
  ])
  const items = data?.items ?? []
  const batches = (bulk?.items ?? []).slice(0, 10)
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-medium text-2xl tracking-tight">Templates</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          {items.length > 0 ? `${pluralize(items.length, "template")}. ` : ""}A document with its
          roles and fields, ready to send again. Save one from any envelope with “Save as template”.
        </p>
      </header>

      {items.length === 0 ? (
        <Panel>
          <EmptyState
            className="md:py-10"
            icon={<LayoutTemplateIcon aria-hidden />}
            title="No templates yet"
            description="Open an envelope you send often and choose “Save as template”."
            action={<ButtonLink href="/envelopes">Go to envelopes</ButtonLink>}
          />
        </Panel>
      ) : (
        <TemplatesTable
          rows={items.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            roles: t.roles.map((r) => r.label),
            fields: t._count.fields,
            document: t.document.name,
            savedBy: t.createdBy.name,
            savedAt: t.createdAt,
            savedLabel: formatDate(new Date(t.createdAt)),
            canManage: t.permissions.manage,
          }))}
        />
      )}

      {batches.length > 0 && (
        <section aria-labelledby="bulk-heading" className="flex flex-col gap-3">
          <h2 id="bulk-heading" className="font-medium text-sm">
            Recent bulk sends
          </h2>
          <BulkSendsTable
            rows={batches.map((b) => ({
              id: b.id,
              template: b.template?.name ?? "Deleted template",
              title: b.title,
              sent: b.sent,
              total: b.total,
              failed: b.failed,
              done: b.status === "DONE",
              startedAt: b.createdAt,
              startedLabel: formatDate(new Date(b.createdAt)),
            }))}
          />
        </section>
      )}
    </div>
  )
}
