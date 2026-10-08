import { documentsSummary } from "@sahihi/core"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ButtonLink } from "@/components/app/button-link"
import { CreateFolderButton } from "@/components/app/folders/create-folder-button"
import {
  FolderBreadcrumb,
  FolderCards,
  FolderHeading,
  FolderRows,
  type FoldersPageData,
} from "@/components/app/folders/folder-section"
import { FileSearchIcon, LayoutTemplateIcon } from "@/components/app/icons"
import { ColorDot, ColorName, TagBadges } from "@/components/app/labels/labels"
import { ListGrid } from "@/components/app/list-card"
import { ListPagination } from "@/components/app/list-pagination"
import { Panel } from "@/components/app/panel"
import { Person } from "@/components/app/people"
import { TemplateCard, type TemplateItem } from "@/components/app/templates/template-card"
import { TemplateRowActions } from "@/components/app/templates/template-row-actions"
import { BulkSendsTable } from "@/components/app/templates/templates-table"
import { TemplatesToolbar } from "@/components/app/templates/templates-toolbar"
import { TemplateTypeIcon } from "@/components/app/type-icons"
import { Badge } from "@/components/arc/badge/badge"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import { foldersApiQuery, searchesEverywhere } from "@/lib/folder-scope"
import { formatDate, formatDateTime, pluralize } from "@/lib/format"
import type { TagRef } from "@/lib/labels"
import { LIST_LAYOUT_COOKIE, resolveListLayout } from "@/lib/list-layout"
import { totalPages } from "@/lib/pagination"
import {
  hasTemplateFilters,
  parseTemplatesView,
  templatesApiQuery,
  templatesHref,
} from "@/lib/template-list"

export const metadata = { title: "Templates" }

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

/**
 * Reusable envelopes of the active workspace (docs/templates.md), with Drive-style search and
 * chips (Saved by, Created, Tags, Color), folders (ADR 0038; shared with Documents and Envelopes)
 * and a list or a grid of document thumbnails, 25 a page (ADR 0036).
 */
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const view = parseTemplatesView(await searchParams)
  const layout = resolveListLayout(
    view.layout,
    (await cookies()).get(LIST_LAYOUT_COOKIE.templates)?.value,
  )
  const folderQuery = foldersApiQuery(view)
  const [templates, folders, { data: bulk }] = await Promise.all([
    apiServer<{
      items: TemplateItem[]
      page: number
      pageSize: number
      total: number
      savers: { id: string; name: string }[]
      tags: TagRef[]
      colors: string[]
    }>(`/templates?${templatesApiQuery(view)}`),
    apiServer<FoldersPageData>(`/folders${folderQuery ? `?${folderQuery}` : ""}`),
    apiServer<{ items: BulkSendListItem[] }>("/bulk-sends"),
  ])
  // A deleted or foreign folder id, or a query the API refuses: start over at the top level.
  if ([templates.status, folders.status].some((s) => s === 400 || s === 404)) {
    redirect("/templates")
  }
  const data = templates.data
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? 1
  const pageSize = data?.pageSize ?? 1
  const pageCount = totalPages(total, pageSize)
  if (items.length === 0 && total > 0) redirect(templatesHref(view, { page: pageCount }))
  const filtered = hasTemplateFilters(view)
  const searching = searchesEverywhere(view)
  const path = folders.data?.path ?? []
  const current = folders.data?.folder ?? null
  const subfolders = folders.data?.items ?? []
  const allTags = data?.tags ?? []
  const folderHref = (folder: string | undefined) => templatesHref(view, { folder })
  // Nothing at all, anywhere: the first-run empty state. Inside a folder, the toolbar stays.
  const blank = total === 0 && subfolders.length === 0 && !filtered && !current
  const folderRows = layout === "list" && page === 1 ? subfolders : []
  const batches = (bulk?.items ?? []).slice(0, 10)
  const pagination =
    pageCount > 1 ? (
      <ListPagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        label="Templates pages"
        hrefs={Array.from({ length: pageCount }, (_, i) => templatesHref(view, { page: i + 1 }))}
      />
    ) : null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {path.length > 0 && (
            <FolderBreadcrumb rootLabel="Templates" path={path} hrefFor={folderHref} />
          )}
          <FolderHeading rootLabel="Templates" current={current} searching={searching} />
          <p className="max-w-2xl text-muted-foreground text-sm">
            {total > 0 ? `${pluralize(total, filtered ? "matching template" : "template")}. ` : ""}A
            document with its roles and fields, ready to send again. Save one from any envelope with
            “Save as template”.
          </p>
        </div>
        {!blank && <CreateFolderButton parentId={current?.id} allTags={allTags} />}
      </header>

      {blank ? (
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
        <section aria-label="Templates" className="flex flex-col gap-6">
          <TemplatesToolbar
            view={view}
            layout={layout}
            savers={data?.savers ?? []}
            tags={allTags}
            colors={data?.colors ?? []}
          />
          {layout === "grid" && (
            <FolderCards
              folders={subfolders}
              current={current}
              searching={searching}
              canCreate={Boolean(folders.data?.permissions?.create)}
              allTags={allTags}
              hrefFor={folderHref}
              rootLabel="Templates"
            />
          )}
          {total === 0 && folderRows.length === 0 ? (
            <Panel>
              <EmptyState
                className="md:py-10"
                icon={<FileSearchIcon aria-hidden />}
                title={filtered ? "No matching templates" : "No templates here"}
                description={
                  filtered
                    ? "Try another search or clear the filters."
                    : "Move templates into this folder, or save one from an envelope."
                }
                action={
                  filtered ? (
                    <ButtonLink href={templatesHref({ folder: view.folder })}>
                      Clear filters
                    </ButtonLink>
                  ) : undefined
                }
              />
            </Panel>
          ) : layout === "grid" ? (
            <div className="flex flex-col gap-4">
              <ListGrid>
                {items.map((t) => (
                  <li key={t.id} className="grid">
                    <TemplateCard template={t} allTags={allTags} />
                  </li>
                ))}
              </ListGrid>
              {pagination}
            </div>
          ) : (
            <Panel className="gap-0 p-2 sm:p-3">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="ps-3">Template</TableHead>
                    <TableHead className="max-md:hidden">Roles</TableHead>
                    <TableHead className="max-lg:hidden">Fields</TableHead>
                    <TableHead className="max-lg:hidden">Saved by</TableHead>
                    <TableHead className="max-md:hidden">Saved</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FolderRows
                    folders={folderRows}
                    current={current}
                    searching={searching}
                    allTags={allTags}
                    hrefFor={folderHref}
                    rootLabel="Templates"
                    columns={4}
                  />
                  {items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="w-full max-w-0 ps-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <TemplateTypeIcon />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="flex min-w-0 items-center gap-2">
                              {t.color && <ColorDot color={t.color} className="size-2.5" />}
                              <Link
                                href={`/templates/${t.id}/use`}
                                title={t.name}
                                className="truncate font-medium underline-offset-4 hover:underline"
                              >
                                {t.name}
                                <ColorName color={t.color} />
                              </Link>
                              <div className="hidden shrink-0 sm:flex">
                                <TagBadges tags={t.tags} max={2} />
                              </div>
                            </div>
                            <span
                              className="truncate text-muted-foreground text-xs"
                              title={t.documents.map((d) => d.name).join(", ")}
                            >
                              {searching && t.folder ? `In ${t.folder.name} · ` : ""}
                              {t.description
                                ? `${t.description} · ${documentsSummary(t.documents.map((d) => d.name))}`
                                : documentsSummary(t.documents.map((d) => d.name))}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-md:hidden">
                        <span className="flex max-w-56 flex-wrap gap-1">
                          {t.roles.map((r) => (
                            <Badge key={r.label} size="sm">
                              {r.label}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-lg:hidden">
                        {pluralize(t._count.fields, "field")}
                      </TableCell>
                      <TableCell className="max-w-44 text-muted-foreground max-lg:hidden">
                        <Person person={t.createdBy} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
                        <time dateTime={t.createdAt} title={formatDateTime(t.createdAt)}>
                          {formatDate(t.createdAt)}
                        </time>
                      </TableCell>
                      <TableCell className="pe-1">
                        <span className="flex items-center justify-end gap-1">
                          {/* Phones keep the row for the name; "Use template" is in the menu there. */}
                          <span className="max-sm:hidden">
                            <ButtonLink size="sm" href={`/templates/${t.id}/use`}>
                              Use template
                            </ButtonLink>
                          </span>
                          <TemplateRowActions
                            template={t}
                            canManage={t.permissions.manage}
                            allTags={allTags}
                          />
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pagination && <div className="border-t px-3 pt-3">{pagination}</div>}
            </Panel>
          )}
        </section>
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
