import { LayoutTemplateIcon } from "lucide-react"
import Link from "next/link"
import {
  type TemplateRow,
  TemplateRowActions,
} from "@/components/app/templates/template-row-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardPanel } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"

interface TemplateListItem extends TemplateRow {
  document: { id: string; name: string; pageCount: number }
  createdBy: { name: string }
  roles: { label: string; role: string }[]
  _count: { fields: number }
  permissions: { manage: boolean }
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

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
})

export default async function TemplatesPage() {
  const [{ data }, { data: bulk }] = await Promise.all([
    apiServer<{ items: TemplateListItem[] }>("/templates"),
    apiServer<{ items: BulkSendListItem[] }>("/bulk-sends"),
  ])
  const items = data?.items ?? []
  const batches = (bulk?.items ?? []).slice(0, 10)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl">Templates</h1>
        <p className="text-muted-foreground text-sm">
          A document with its roles and fields, ready to send again. Save one from any envelope's
          page with “Save as template”.
        </p>
      </div>
      <Card>
        <CardPanel>
          {items.length === 0 ? (
            <Empty className="md:py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutTemplateIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No templates yet</EmptyTitle>
                <EmptyDescription>
                  Open an envelope you send often and choose “Save as template”.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Saved by</TableHead>
                  <TableHead className="w-60">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      {t.description && (
                        <div className="max-w-80 truncate text-muted-foreground text-xs">
                          {t.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.roles.map((r) => (
                          <Badge key={r.label} variant="outline">
                            {r.label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.document.name} · {t._count.fields}{" "}
                      {t._count.fields === 1 ? "field" : "fields"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.createdBy.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" render={<Link href={`/templates/${t.id}/use`} />}>
                          Use
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          render={<Link href={`/templates/${t.id}/bulk`} />}
                        >
                          Bulk send
                        </Button>
                        {t.permissions.manage && <TemplateRowActions template={t} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardPanel>
      </Card>
      {batches.length > 0 && (
        <Card>
          <CardPanel>
            <p className="pb-3 font-medium text-sm">Recent bulk sends</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/bulk-sends/${b.id}`} className="font-medium hover:underline">
                        {b.title}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {b.template?.name ?? "Deleted template"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {b.sent}/{b.total} sent{b.failed > 0 ? `, ${b.failed} failed` : ""}
                      {b.status !== "DONE" ? " · in progress" : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {when.format(new Date(b.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardPanel>
        </Card>
      )}
    </div>
  )
}
