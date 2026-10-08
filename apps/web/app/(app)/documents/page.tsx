import type { DocumentStatus } from "@sahihi/core"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ButtonLink } from "@/components/app/button-link"
import { DocumentCard, type DocumentCardData } from "@/components/app/documents/document-card"
import { DocumentRowActions } from "@/components/app/documents/document-row-actions"
import { DocumentTypeIcon } from "@/components/app/documents/document-type-icon"
import { DocumentsToolbar } from "@/components/app/documents/documents-toolbar"
import { CreateFolderButton } from "@/components/app/folders/create-folder-button"
import {
  FolderCard,
  type FolderCardData,
  FolderRowActions,
} from "@/components/app/folders/folder-card"
import { FileSearchIcon, FolderIcon } from "@/components/app/icons"
import { ColorDot, ColorName, TagBadges } from "@/components/app/labels/labels"
import { Panel } from "@/components/app/panel"
import { Person } from "@/components/app/people"
import { DocumentStatusIcon } from "@/components/app/status-icon"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import {
  type DocumentsView,
  documentsApiQuery,
  documentsHref,
  folderMeta,
  foldersApiQuery,
  hasFilters,
  parseDocumentsView,
  searchesEverywhere,
} from "@/lib/documents-list"
import { formatDate, formatDateTime, pluralize } from "@/lib/format"
import type { TagRef } from "@/lib/labels"
import { LIST_LAYOUT_COOKIE, resolveListLayout } from "@/lib/list-layout"
import { totalPages } from "@/lib/pagination"
import { DocumentsPagination } from "./documents-pagination"
import { UploadDocument, UploadDropzone } from "./upload-document"

interface DocumentRow extends DocumentCardData {
  status: DocumentStatus
  source: { id: string; name: string } | null
  uploadedBy: { id: string; name: string; image: string | null }
  folder: { id: string; name: string } | null
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
  const layout = resolveListLayout(
    view.layout,
    (await cookies()).get(LIST_LAYOUT_COOKIE.documents)?.value,
  )
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

  // The grid needs documents to show; empty and blank states keep the list's panel.
  const grid = layout === "grid" && !blank && total > 0
  // List: folders become rows at the top of the table (first page only). Grid: folder cards.
  const folderCards = layout === "grid"
  const folderRows = layout === "list" && page === 1 ? subfolders : []
  const pagination = (
    <DocumentsPagination
      view={view}
      page={page}
      pageCount={pageCount}
      total={total}
      pageSize={pageSize}
    />
  )

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

      {/* Search sits above the folders, like Drive: it finds folders and documents anywhere. */}
      {!blank && (
        <DocumentsToolbar
          view={view}
          layout={layout}
          senders={data?.senders ?? []}
          tags={allTags}
          colors={data?.colors ?? []}
        />
      )}

      {/* Grid: folders as cards above the documents (the list puts them in the table instead).
          No subfolders here yet: a ghost card where they would be, to create the first one. */}
      {folderCards &&
        !searching &&
        subfolders.length === 0 &&
        folders.data?.permissions?.create && (
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
      {folderCards && subfolders.length > 0 && (
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

        {grid ? (
          // Cards on the page itself: a panel around them would nest cards in a card.
          <div className="flex flex-col gap-4">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-x-6 sm:gap-y-8">
              {items.map((d) => (
                <li key={d.id} className="grid">
                  <DocumentCard document={d} searching={searching} allTags={allTags} />
                </li>
              ))}
            </ul>
            {pageCount > 1 && pagination}
          </div>
        ) : (
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
            ) : total === 0 && folderRows.length === 0 ? (
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
                  {/* Folders first, like Drive's list; only on the first page of documents. */}
                  {folderRows.map((f) => {
                    const parent = searching ? f.path?.at(-1) : current
                    return (
                      <TableRow key={`folder-${f.id}`}>
                        <TableCell className="w-full max-w-0 ps-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <FolderIcon
                              aria-hidden
                              className="size-5 shrink-0 text-muted-foreground"
                            />
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <div className="flex min-w-0 items-center gap-2">
                                {f.color && <ColorDot color={f.color} className="size-2.5" />}
                                <Link
                                  href={documentsHref(view, { folder: f.id })}
                                  title={f.name}
                                  className="truncate font-medium underline-offset-4 hover:underline"
                                >
                                  {f.name}
                                  <ColorName color={f.color} />
                                </Link>
                                <div className="hidden shrink-0 sm:flex">
                                  <TagBadges tags={f.tags} max={2} />
                                </div>
                              </div>
                              <span className="truncate text-muted-foreground text-xs tabular-nums">
                                {folderMeta(f)}
                              </span>
                              <div className="sm:hidden">
                                <TagBadges tags={f.tags} />
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground max-md:hidden">
                          {f.createdBy && <Person person={f.createdBy} />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
                          {f.createdAt && (
                            <time dateTime={f.createdAt} title={formatDateTime(f.createdAt)}>
                              {formatDate(f.createdAt)}
                            </time>
                          )}
                        </TableCell>
                        <TableCell className="pe-1">
                          <FolderRowActions
                            folder={f}
                            parentId={parent?.id ?? null}
                            parentName={parentLabel(parent)}
                            allTags={allTags}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {items.map((d) => {
                    return (
                      <TableRow key={d.id}>
                        {/* w-full + max-w-0: the name takes the spare width and truncates instead of
                            pushing the other columns out of the card. */}
                        <TableCell className="w-full max-w-0 ps-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <DocumentTypeIcon status={d.status} />
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
                                {d.status !== "READY" && <DocumentStatusIcon status={d.status} />}
                                {/* Tags sit inline after the name, which truncates first; on
                                    phones the row is too narrow, so they keep their own line. */}
                                <div className="hidden shrink-0 sm:flex">
                                  <TagBadges tags={d.tags} max={2} />
                                </div>
                              </div>
                              <DocumentMeta document={d} searching={searching} />
                              <div className="sm:hidden">
                                <TagBadges tags={d.tags} />
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground max-md:hidden">
                          <Person person={d.uploadedBy} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
                          <time dateTime={d.createdAt} title={formatDateTime(d.createdAt)}>
                            {formatDate(d.createdAt)}
                          </time>
                        </TableCell>
                        <TableCell className="pe-1">
                          <DocumentRowActions document={d} allTags={allTags} compact />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
            {pageCount > 1 && <div className="border-t px-3 pt-3">{pagination}</div>}
          </Panel>
        )}
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
