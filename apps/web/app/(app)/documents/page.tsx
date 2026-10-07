import type { DocumentStatus } from "@sahihi/core"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ButtonLink } from "@/components/app/button-link"
import { DocumentRowActions } from "@/components/app/documents/document-row-actions"
import { DocumentsToolbar } from "@/components/app/documents/documents-toolbar"
import { CreateFolderButton } from "@/components/app/folders/create-folder-button"
import { FolderCard, type FolderCardData } from "@/components/app/folders/folder-card"
import { FileSearchIcon, FileTextIcon } from "@/components/app/icons"
import { ColorDot, ColorName, TagBadges } from "@/components/app/labels/labels"
import { Panel } from "@/components/app/panel"
import { Badge } from "@/components/arc/badge/badge"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
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
import { DOCUMENT_STATUS_BADGE } from "@/lib/constants"
import {
  type DocumentsView,
  documentsApiQuery,
  documentsHref,
  foldersApiQuery,
  hasFilters,
  parseDocumentsView,
  searchesEverywhere,
} from "@/lib/documents-list"
import { formatDate, formatDateTime, pluralize } from "@/lib/format"
import type { TagRef } from "@/lib/labels"
import { totalPages } from "@/lib/pagination"
import { DocumentsPagination } from "./documents-pagination"
import { UploadDocument, UploadDropzone } from "./upload-document"

interface DocumentRow {
  id: string
  name: string
  status: DocumentStatus
  createdAt: string
  source: { id: string; name: string } | null
  uploadedBy: { id: string; name: string }
  folder: { id: string; name: string } | null
  folderId: string | null
  color: string | null
  tags: TagRef[]
  permissions: { move: boolean; label: boolean; rename: boolean }
}

export const metadata = { title: "Documents" }

interface DocumentsPageData {
  items: DocumentRow[]
  page: number
  pageSize: number
  total: number
  senders: { id: string; name: string }[]
  tags: TagRef[]
  /** Label colours in use, for the Color filter. */
  colors: string[]
}

interface FoldersPageData {
  folder: {
    id: string
    name: string
    parentId: string | null
    color: string | null
    tags: TagRef[]
  } | null
  path: { id: string; name: string }[]
  items: FolderCardData[]
  permissions?: { create: boolean }
}

/**
 * Home of the app: folders (ADR 0022) and the documents in the open one, with search and filters.
 * Search, tag and color find folders and documents anywhere (ADR 0025).
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const view = parseDocumentsView(await searchParams)
  const searching = searchesEverywhere(view)
  const folderQuery = foldersApiQuery(view)
  const [docs, folders] = await Promise.all([
    apiServer<DocumentsPageData>(`/documents?${documentsApiQuery(view)}`),
    apiServer<FoldersPageData>(`/folders${folderQuery ? `?${folderQuery}` : ""}`),
  ])
  // A deleted or foreign folder id, or a query the API refuses: start over at the top level.
  if (
    docs.status === 404 ||
    folders.status === 404 ||
    docs.status === 400 ||
    folders.status === 400
  ) {
    redirect("/documents")
  }
  const data = docs.data
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? 1
  const pageSize = data?.pageSize ?? 1
  const pageCount = totalPages(total, pageSize)
  // Past the last page (e.g. after deletes): go to the last page that has rows.
  if (items.length === 0 && total > 0) redirect(documentsHref(view, { page: pageCount }))

  const path = folders.data?.path ?? []
  const current = folders.data?.folder ?? null
  const subfolders = folders.data?.items ?? []
  const allTags = data?.tags ?? []
  const filtered = hasFilters(view)
  const blank = total === 0 && subfolders.length === 0 && !filtered

  const heading = searching ? "Search results" : (current?.name ?? "Documents")
  const countLine = filtered
    ? `${pluralize(total, "matching document")}${searching && subfolders.length > 0 ? `, ${pluralize(subfolders.length, "folder")}` : ""}`
    : `${pluralize(total, "document")}${subfolders.length > 0 ? `, ${pluralize(subfolders.length, "folder")}` : ""}`

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {/* Only inside a folder: at the top level the title already says where you are. */}
          {path.length > 0 && <FolderBreadcrumb view={view} path={path} />}
          <h1 className="truncate font-medium text-2xl tracking-tight">
            {heading}
            {!searching && <ColorName color={current?.color} />}
          </h1>
          {/* Inside a folder: its label colour as a dot, then its tags, like on its card. */}
          {!searching && current && (current.color || current.tags.length > 0) && (
            <div className="flex min-w-0 items-center gap-2">
              {current.color && <ColorDot color={current.color} />}
              <TagBadges tags={current.tags} max={6} />
            </div>
          )}
          {!blank && <p className="text-muted-foreground text-sm tabular-nums">{countLine}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreateFolderButton parentId={view.folder} allTags={allTags} />
          <UploadDocument folderId={view.folder} />
        </div>
      </header>

      {/* No subfolders here yet: a ghost card where they would be, to create the first one. */}
      {!searching && subfolders.length === 0 && folders.data?.permissions?.create && (
        <section aria-labelledby="folders-heading" className="flex flex-col gap-3">
          <h2 id="folders-heading" className="font-medium text-sm">
            Folders
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CreateFolderButton parentId={view.folder} allTags={allTags} appearance="ghost" />
          </div>
        </section>
      )}

      {/* Searching: matching folders from anywhere, each saying where it lives. */}
      {subfolders.length > 0 && (
        <section aria-labelledby="folders-heading" className="flex flex-col gap-3">
          <h2 id="folders-heading" className="font-medium text-sm">
            Folders
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subfolders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                href={documentsHref(view, { folder: f.id })}
                parentId={searching ? (f.path?.at(-1)?.id ?? null) : (current?.id ?? null)}
                parentName={parentLabel(searching ? f.path?.at(-1) : current)}
                allTags={allTags}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="documents-heading" className="flex flex-col gap-3">
        <h2 id="documents-heading" className="sr-only">
          Documents in this folder
        </h2>
        {!blank && (
          <DocumentsToolbar
            view={view}
            senders={data?.senders ?? []}
            tags={allTags}
            colors={data?.colors ?? []}
          />
        )}

        <Panel className="gap-0 p-2 sm:p-3">
          {blank ? (
            // The drop zone is the one next step, so it is the empty state (one icon, not two).
            <div className="flex flex-col items-center gap-4 px-2 py-8 text-center sm:py-12">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {current ? "This folder is empty" : "No documents yet"}
                </p>
                <p className="text-muted-foreground text-sm">
                  {current
                    ? "Upload a PDF here or move documents into this folder."
                    : "Upload your first PDF to send it for signature."}
                </p>
              </div>
              <div className="w-full max-w-md">
                <UploadDropzone folderId={view.folder} />
              </div>
            </div>
          ) : total === 0 ? (
            <EmptyState
              className="md:py-10"
              icon={<FileSearchIcon aria-hidden />}
              title={filtered ? "No matching documents" : "No documents here"}
              description={
                filtered
                  ? "Try another search or clear the filters."
                  : "Open a folder above, or upload a PDF into this one."
              }
              action={
                filtered ? (
                  <ButtonLink href={documentsHref({ folder: view.folder })}>
                    Clear filters
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <Table>
              {/* <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-3">Name</TableHead>
                  <TableHead className="max-md:hidden">Sender</TableHead>
                  <TableHead className="max-md:hidden">Added</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader> */}
              <TableBody>
                {items.map((d) => {
                  const status = DOCUMENT_STATUS_BADGE[d.status]
                  return (
                    <TableRow key={d.id}>
                      {/* w-full + max-w-0: the name takes the spare width and truncates instead of
                          pushing the other columns out of the card. */}
                      <TableCell className="w-full max-w-0 ps-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <FileTextIcon aria-hidden className="shrink-0 text-muted-foreground" />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="flex min-w-0 items-center gap-2">
                              {d.color && <ColorDot color={d.color} className="size-2.5" />}
                              <Link
                                href={`/documents/${d.id}`}
                                title={d.name}
                                className="truncate font-medium underline-offset-4 hover:underline"
                              >
                                {d.name}
                                <ColorName color={d.color} />
                              </Link>
                              {/* Ready is the normal state; only something else earns a badge. */}
                              {d.status !== "READY" && (
                                <Badge tone={status.tone} size="sm">
                                  {status.label}
                                </Badge>
                              )}
                            </div>
                            <DocumentMeta document={d} searching={searching} />
                            <TagBadges tags={d.tags} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground max-md:hidden">
                        {d.uploadedBy.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
                        <time dateTime={d.createdAt} title={formatDateTime(d.createdAt)}>
                          {formatDate(d.createdAt)}
                        </time>
                      </TableCell>
                      <TableCell className="pe-1">
                        <DocumentRowActions document={d} allTags={allTags} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          {pageCount > 1 && (
            <div className="border-t px-3 pt-3">
              <DocumentsPagination
                view={view}
                page={page}
                pageCount={pageCount}
                total={total}
                pageSize={pageSize}
              />
            </div>
          )}
        </Panel>
      </section>
    </div>
  )
}

/** Where a deleted folder's contents go, for its confirmation: “Parent” or the top level. */
const parentLabel = (parent: { name: string } | null | undefined) =>
  parent ? `“${parent.name}”` : "the top level"

/** The line under a document's name: where it came from, plus sender and date on phones. */
function DocumentMeta({ document: d, searching }: { document: DocumentRow; searching: boolean }) {
  const parts = [
    searching && d.folder ? `In ${d.folder.name}` : null,
    d.source ? `Prepared from ${d.source.name}` : null,
  ].filter(Boolean)
  return (
    <>
      {parts.length > 0 && (
        <span className="truncate text-muted-foreground text-xs">{parts.join(" · ")}</span>
      )}
      <span className="truncate text-muted-foreground text-xs md:hidden">
        {d.uploadedBy.name} · {formatDate(d.createdAt)}
      </span>
    </>
  )
}

function FolderBreadcrumb({
  view,
  path,
}: {
  view: DocumentsView
  path: { id: string; name: string }[]
}) {
  // Shown inside folders only. The last item is the current folder (no link).
  const items = [
    { label: "Documents", href: documentsHref(view, { folder: undefined }) },
    ...path.map((p, i) => ({
      label: p.name,
      href: i === path.length - 1 ? undefined : documentsHref(view, { folder: p.id }),
    })),
  ]
  return <Breadcrumb items={items} ariaLabel="Folders" />
}
