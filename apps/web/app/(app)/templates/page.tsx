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
export default async function TemplatesPage() {
  const { data } = await apiServer<{ items: TemplateListItem[] }>("/templates")
  const items = data?.items ?? []
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
                  <TableHead className="w-40">
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
    </div>
  )
}
