import { documentsSummary } from "@sahihi/core"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { UploadDocument, UploadDropzone } from "@/app/(app)/documents/upload-document"
import { ButtonLink } from "@/components/app/button-link"
import { DocumentCard, type DocumentCardData } from "@/components/app/documents/document-card"
import { DocumentRowActions } from "@/components/app/documents/document-row-actions"
import { DocumentTypeIcon } from "@/components/app/documents/document-type-icon"
import { EnvelopeCard, type EnvelopeItem } from "@/components/app/envelope/envelope-card"
import { EnvelopeRowActions } from "@/components/app/envelope/envelope-row-actions"
import {
  BreadcrumbDrops,
  DragCard,
  DragRow,
  SelectCell,
  SelectHead,
} from "@/components/app/files/drag-items"
import { FilesDnd } from "@/components/app/files/files-dnd"
import { FilesToolbar } from "@/components/app/files/files-toolbar"
import { CreateFolderButton } from "@/components/app/folders/create-folder-button"
import {
  FolderBreadcrumb,
  FolderCards,
  FolderHeading,
  FolderRows,
  type FoldersPageData,
} from "@/components/app/folders/folder-section"
import { FileSearchIcon, PlusIcon } from "@/components/app/icons"
import { ColorDot, ColorName, TagBadges } from "@/components/app/labels/labels"
import { ListGrid } from "@/components/app/list-card"
import { ListPagination } from "@/components/app/list-pagination"
import { Panel } from "@/components/app/panel"
import { Person } from "@/components/app/people"
import { DocumentStatusIcon, EnvelopeStatusIcon } from "@/components/app/status-icon"
import { TemplateCard, type TemplateItem } from "@/components/app/templates/template-card"
import { TemplateRowActions } from "@/components/app/templates/template-row-actions"
import { EnvelopeTypeIcon, TemplateTypeIcon } from "@/components/app/type-icons"
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
import { recipientSummary, signingProgress } from "@/lib/envelope-list"
import type { DropTarget, MovableItem } from "@/lib/file-moves"
import { filesApiQuery, filesHref, hasFileFilters, parseFilesView } from "@/lib/files-list"
import { foldersApiQuery, searchesEverywhere } from "@/lib/folder-scope"
import { formatDate, formatDateTime, pluralize } from "@/lib/format"
import type { TagRef } from "@/lib/labels"
import { LIST_LAYOUT_COOKIE, resolveListLayout } from "@/lib/list-layout"
import { totalPages } from "@/lib/pagination"

export const metadata = { title: "All files" }

type DocumentFile = DocumentCardData & {
  kind: "document"
  uploadedBy: { id: string; name: string; image: string | null }
  source: { id: string; name: string } | null
}
type EnvelopeFile = EnvelopeItem & { kind: "envelope" }
type TemplateFile = TemplateItem & { kind: "template" }
type FileItem = DocumentFile | EnvelopeFile | TemplateFile

interface FilesPageData {
  items: FileItem[]
  page: number
  pageSize: number
  total: number
  counts: { document: number; envelope: number; template: number }
  people: { id: string; name: string }[]
  tags: TagRef[]
  colors: string[]
}

const ROOT = "All files"

/** A file as something to drag and select (ADR 0039), with whether the user may move it. */
function fileDrag(item: FileItem): { item: MovableItem; canMove: boolean } {
  const name = item.kind === "envelope" ? item.title : item.name
  return {
    item: { kind: item.kind, id: item.id, name, folderId: item.folderId },
    canMove: item.kind === "document" ? item.permissions.move : item.permissions.manage,
  }
}

/**
 * Home of the app (ADR 0038): documents, envelopes and templates together, newest first, in the
 * folders they share. One search and one row of chips (Type, Status, People, Added, Tags, Color)
 * cover every type. Rows and cards are each type's own, with its own ⋮ menu.
 */
export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const view = parseFilesView(await searchParams)
  const layout = resolveListLayout(
    view.layout,
    (await cookies()).get(LIST_LAYOUT_COOKIE.files)?.value,
  )
  const folderQuery = foldersApiQuery(view)
  const [files, folders] = await Promise.all([
    apiServer<FilesPageData>(`/files?${filesApiQuery(view)}`),
    apiServer<FoldersPageData>(`/folders${folderQuery ? `?${folderQuery}` : ""}`),
  ])
  // A deleted or foreign folder id, or a query the API refuses: start over at the top level.
  if ([files.status, folders.status].some((s) => s === 400 || s === 404)) redirect("/files")

  const data = files.data
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? 1
  const pageSize = data?.pageSize ?? 1
  const pageCount = totalPages(total, pageSize)
  // Past the last page (e.g. after a move): go to the last page that has rows.
  if (items.length === 0 && total > 0 && page > 1) redirect(filesHref(view, { page: pageCount }))

  const filtered = hasFileFilters(view)
  const searching = searchesEverywhere(view)
  const path = folders.data?.path ?? []
  const current = folders.data?.folder ?? null
  const subfolders = folders.data?.items ?? []
  const allTags = data?.tags ?? []
  const folderHref = (folder: string | undefined) => filesHref(view, { folder })
  // Folders only list for a search, a tag or a colour: other chips narrow files, not folders.
  const showFolders = !filtered || searching
  const shownFolders = showFolders ? subfolders : []
  const blank = total === 0 && subfolders.length === 0 && !filtered
  const folderRows = layout === "list" && page === 1 ? shownFolders : []
  const countLine = [
    pluralize(total, filtered ? "matching item" : "item"),
    shownFolders.length > 0 ? pluralize(shownFolders.length, "folder") : null,
  ]
    .filter(Boolean)
    .join(", ")
  // Drag and drop (ADR 0039): the page's items in order, the open folder and the crumbs above it.
  const shownFolderItems = layout === "grid" ? shownFolders : folderRows
  const movable: MovableItem[] = [
    ...shownFolderItems.map((f) => ({
      item: {
        kind: "folder" as const,
        id: f.id,
        name: f.name,
        folderId: searching ? (f.path?.at(-1)?.id ?? null) : (current?.id ?? null),
      },
      canMove: f.permissions.manage,
    })),
    ...items.map(fileDrag),
  ]
    .filter((d) => d.canMove)
    .map((d) => d.item)
  const here: DropTarget = {
    folderId: current?.id ?? null,
    name: current?.name ?? ROOT,
    path: path.map((p) => p.id),
  }
  const crumbs: DropTarget[] = [
    { folderId: null, name: ROOT, path: [] },
    ...path.slice(0, -1).map((p, i) => ({
      folderId: p.id,
      name: p.name,
      path: path.slice(0, i + 1).map((x) => x.id),
    })),
  ]

  const pagination =
    pageCount > 1 ? (
      <ListPagination
        page={page}
        pageCount={Math.min(pageCount, 40)}
        total={total}
        pageSize={pageSize}
        label="All files pages"
        hrefs={Array.from({ length: Math.min(pageCount, 40) }, (_, i) =>
          filesHref(view, { page: i + 1 }),
        )}
      />
    ) : null

  return (
    <FilesDnd
      items={movable}
      current={here}
      resetKey={filesHref(view)}
      fileDrop={!blank}
      hideMoved={!searching}
    >
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            {path.length > 0 && (
              <BreadcrumbDrops targets={crumbs}>
                <FolderBreadcrumb rootLabel={ROOT} path={path} hrefFor={folderHref} />
              </BreadcrumbDrops>
            )}
            <FolderHeading rootLabel={ROOT} current={current} searching={searching} />
            {!blank && <p className="text-muted-foreground text-sm tabular-nums">{countLine}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CreateFolderButton parentId={current?.id} allTags={allTags} />
            <ButtonLink
              variant="secondary"
              href={
                current
                  ? `/envelopes/new?folder=${encodeURIComponent(current.id)}`
                  : "/envelopes/new"
              }
            >
              <PlusIcon aria-hidden />
              New envelope
            </ButtonLink>
            <UploadDocument folderId={current?.id} />
          </div>
        </header>

        {!blank && (
          <FilesToolbar
            view={view}
            layout={layout}
            people={data?.people ?? []}
            tags={allTags}
            colors={data?.colors ?? []}
          />
        )}

        {layout === "grid" && !blank && (
          <FolderCards
            folders={shownFolders}
            current={current}
            path={path}
            searching={searching || filtered}
            canCreate={Boolean(folders.data?.permissions?.create) && !filtered}
            allTags={allTags}
            hrefFor={folderHref}
            rootLabel={ROOT}
          />
        )}

        <section aria-labelledby="files-heading" className="flex flex-col gap-3">
          <h2 id="files-heading" className="sr-only">
            Files in this folder
          </h2>
          {blank ? (
            <Panel>
              {/* The drop zone is the one next step, so it is the empty state. */}
              <div className="flex flex-col items-center gap-4 px-2 py-8 text-center sm:py-12">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    {current ? "This folder is empty" : "Nothing here yet"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {current
                      ? "Upload a PDF here, or move documents, envelopes and templates into it."
                      : "Upload your first PDF to send it for signature."}
                  </p>
                </div>
                <div className="w-full max-w-md">
                  <UploadDropzone folderId={current?.id} />
                </div>
              </div>
            </Panel>
          ) : total === 0 && folderRows.length === 0 ? (
            <Panel>
              <EmptyState
                className="md:py-10"
                icon={<FileSearchIcon aria-hidden />}
                title={filtered ? "Nothing matches" : "No files here"}
                description={
                  filtered
                    ? "Try another search or clear the filters."
                    : "Open a folder above, or add something to this one."
                }
                action={
                  filtered ? (
                    <ButtonLink href={filesHref({ folder: view.folder })}>Clear filters</ButtonLink>
                  ) : undefined
                }
              />
            </Panel>
          ) : layout === "grid" ? (
            <div className="flex flex-col gap-4">
              <ListGrid>
                {items.map((item) => (
                  <DragCard key={`${item.kind}-${item.id}`} className="grid" {...fileDrag(item)}>
                    {item.kind === "document" ? (
                      <DocumentCard document={item} searching={searching} allTags={allTags} />
                    ) : item.kind === "envelope" ? (
                      <EnvelopeCard envelope={item} allTags={allTags} />
                    ) : (
                      <TemplateCard template={item} allTags={allTags} />
                    )}
                  </DragCard>
                ))}
              </ListGrid>
              {pagination}
            </div>
          ) : (
            <Panel className="gap-0 p-2 sm:p-3">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SelectHead />
                    <TableHead className="ps-3">Name</TableHead>
                    <TableHead className="max-md:hidden">Owner</TableHead>
                    <TableHead className="max-md:hidden">Added</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FolderRows
                    folders={folderRows}
                    current={current}
                    path={path}
                    searching={searching}
                    allTags={allTags}
                    hrefFor={folderHref}
                    rootLabel={ROOT}
                  />
                  {items.map((item) => (
                    <FileRow
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      searching={searching}
                      allTags={allTags}
                    />
                  ))}
                </TableBody>
              </Table>
              {pagination && <div className="border-t px-3 pt-3">{pagination}</div>}
            </Panel>
          )}
        </section>
      </div>
    </FilesDnd>
  )
}

/** What a row says about its item: the type's own detail, the folder while searching. */
function rowFacts(item: FileItem, searching: boolean) {
  const where = searching && item.folder ? `In ${item.folder.name}` : null
  switch (item.kind) {
    case "document":
      return {
        href: `/documents/${item.id}`,
        name: item.name,
        icon: <DocumentTypeIcon status={item.status} />,
        status: item.status !== "READY" ? <DocumentStatusIcon status={item.status} /> : null,
        owner: item.uploadedBy,
        meta: ["Document", where, item.source ? `Prepared from ${item.source.name}` : null],
      }
    case "envelope": {
      const progress = signingProgress(item.recipients)
      return {
        // A draft opens in the editor for whoever may edit it, like its ⋮ menu.
        href:
          item.status === "DRAFT" && item.permissions.manage
            ? `/envelopes/${item.id}/edit`
            : `/envelopes/${item.id}`,
        name: item.title,
        icon: <EnvelopeTypeIcon />,
        status: <EnvelopeStatusIcon status={item.status} />,
        owner: item.createdBy,
        meta: [
          "Envelope",
          where,
          recipientSummary(item.recipients.map((r) => r.name)),
          item.status !== "DRAFT" && progress.total > 0
            ? `${progress.signed} of ${progress.total} signed`
            : null,
        ],
      }
    }
    case "template":
      return {
        href: `/templates/${item.id}/use`,
        name: item.name,
        icon: <TemplateTypeIcon />,
        status: null,
        owner: item.createdBy,
        meta: ["Template", where, documentsSummary(item.documents.map((d) => d.name))],
      }
  }
}

function FileRow({
  item,
  searching,
  allTags,
}: {
  item: FileItem
  searching: boolean
  allTags: TagRef[]
}) {
  const f = rowFacts(item, searching)
  const drag = fileDrag(item)
  return (
    <DragRow {...drag}>
      <SelectCell {...drag} />
      {/* w-full + max-w-0: the name takes the spare width and truncates instead of pushing the
          other columns out of the card. */}
      <TableCell className="w-full max-w-0 ps-3">
        <div className="flex min-w-0 items-center gap-3">
          {f.icon}
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              {item.color && <ColorDot color={item.color} className="size-2.5" />}
              <Link
                href={f.href}
                title={f.name}
                className="truncate font-medium underline-offset-4 hover:underline"
              >
                {f.name}
                <ColorName color={item.color} />
              </Link>
              {f.status}
              <div className="hidden shrink-0 sm:flex">
                <TagBadges tags={item.tags} max={2} />
              </div>
            </div>
            <span className="truncate text-muted-foreground text-xs">
              {f.meta.filter(Boolean).join(" · ")}
            </span>
            <span className="truncate text-muted-foreground text-xs md:hidden">
              {f.owner.name} · {formatDate(item.createdAt)}
            </span>
            <div className="sm:hidden">
              <TagBadges tags={item.tags} />
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-44 whitespace-nowrap text-muted-foreground max-md:hidden">
        <Person person={f.owner} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
        <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
          {formatDate(item.createdAt)}
        </time>
      </TableCell>
      <TableCell className="pe-1">
        {item.kind === "document" ? (
          <DocumentRowActions document={item} allTags={allTags} compact />
        ) : item.kind === "envelope" ? (
          <EnvelopeRowActions envelope={item} allTags={allTags} />
        ) : (
          <TemplateRowActions
            template={item}
            canManage={item.permissions.manage}
            allTags={allTags}
          />
        )}
      </TableCell>
    </DragRow>
  )
}
