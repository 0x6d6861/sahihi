import Link from "next/link"
import { CreateFolderButton } from "@/components/app/folders/create-folder-button"
import {
  FolderCard,
  type FolderCardData,
  FolderRowActions,
} from "@/components/app/folders/folder-card"
import { FolderIcon } from "@/components/app/icons"
import { ColorDot, ColorName, TagBadges } from "@/components/app/labels/labels"
import { Person } from "@/components/app/people"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
import { TableCell, TableRow } from "@/components/ui/table"
import { folderMeta } from "@/lib/documents-list"
import { formatDate, formatDateTime } from "@/lib/format"
import type { TagRef } from "@/lib/labels"

/**
 * Folders on a list page (ADR 0022, 0038): Documents, Envelopes, Templates and All files share
 * them. Each page passes `hrefFor`, so opening a folder keeps you on the same page.
 */

/** `GET /api/folders` for one level (or matching folders anywhere while searching). */
export interface FoldersPageData {
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

type Ref = { id: string; name: string }

/** Where a deleted folder's contents go, for its confirmation: “Parent” or the top level. */
export const parentLabel = (parent: { name: string } | null | undefined) =>
  parent ? `“${parent.name}”` : "the top level"

/** The open folder's parent, or a search result's own parent. */
const parentOf = (f: FolderCardData, current: Ref | null, searching: boolean) =>
  searching ? f.path?.at(-1) : current

/** Shown inside folders only. The last item is the current folder (no link). */
export function FolderBreadcrumb({
  rootLabel,
  path,
  hrefFor,
}: {
  /** The page's name ("Documents", "All files"), linking to its top level. */
  rootLabel: string
  path: Ref[]
  hrefFor: (folderId: string | undefined) => string
}) {
  const items = [
    { label: rootLabel, href: hrefFor(undefined) },
    ...path.map((p, i) => ({
      label: p.name,
      href: i === path.length - 1 ? undefined : hrefFor(p.id),
    })),
  ]
  return <Breadcrumb items={items} ariaLabel="Folders" />
}

/** The open folder's name with its colour dot and tags, for the page header. */
export function FolderHeading({
  rootLabel,
  current,
  searching,
}: {
  rootLabel: string
  current: FoldersPageData["folder"]
  searching: boolean
}) {
  return (
    <>
      <h1 className="truncate font-medium text-2xl tracking-tight">
        {searching ? "Search results" : (current?.name ?? rootLabel)}
        {!searching && <ColorName color={current?.color} />}
      </h1>
      {/* Inside a folder: its label colour as a dot, then its tags, like on its card. */}
      {!searching && current && (current.color || current.tags.length > 0) && (
        <div className="flex min-w-0 items-center gap-2">
          {current.color && <ColorDot color={current.color} />}
          <TagBadges tags={current.tags} max={6} />
        </div>
      )}
    </>
  )
}

/**
 * Grid layout: folders as cards above the items. No subfolders yet: a ghost card where they would
 * be, to create the first one. While searching: matching folders from anywhere.
 */
export function FolderCards({
  folders,
  current,
  searching,
  canCreate,
  allTags,
  hrefFor,
  rootLabel,
}: {
  folders: FolderCardData[]
  current: Ref | null
  searching: boolean
  canCreate: boolean
  allTags: TagRef[]
  hrefFor: (folderId: string) => string
  rootLabel: string
}) {
  if (folders.length === 0 && (searching || !canCreate)) return null
  return (
    <section aria-labelledby="folders-heading" className="flex flex-col gap-3">
      <h2 id="folders-heading" className="font-medium text-sm">
        Folders
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {folders.length === 0 ? (
          <CreateFolderButton parentId={current?.id} allTags={allTags} appearance="ghost" />
        ) : (
          folders.map((f) => {
            const parent = parentOf(f, current, searching)
            return (
              <FolderCard
                key={f.id}
                folder={f}
                href={hrefFor(f.id)}
                parentId={parent?.id ?? null}
                parentName={parentLabel(parent)}
                allTags={allTags}
                rootLabel={rootLabel}
              />
            )
          })
        )}
      </div>
    </section>
  )
}

/**
 * List layout: folders as the first rows of the table, like Drive's list. `columns` is how many
 * cells sit between the name and the ⋮ menu on that page. With the Documents layout (2: person,
 * date) the folder fills them with its creator and date; any other table has its own columns, so
 * the name cell spans them instead.
 */
export function FolderRows({
  folders,
  current,
  searching,
  allTags,
  hrefFor,
  rootLabel,
  columns = 2,
}: {
  folders: FolderCardData[]
  current: Ref | null
  searching: boolean
  allTags: TagRef[]
  hrefFor: (folderId: string) => string
  rootLabel: string
  columns?: number
}) {
  return folders.map((f) => {
    const parent = parentOf(f, current, searching)
    return (
      <TableRow key={`folder-${f.id}`}>
        <TableCell
          className="w-full max-w-0 ps-3"
          colSpan={columns === 2 ? undefined : columns + 1}
        >
          <div className="flex min-w-0 items-center gap-3">
            <FolderIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                {f.color && <ColorDot color={f.color} className="size-2.5" />}
                <Link
                  href={hrefFor(f.id)}
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
                {folderMeta(f, rootLabel)}
              </span>
              <div className="sm:hidden">
                <TagBadges tags={f.tags} />
              </div>
            </div>
          </div>
        </TableCell>
        {columns === 2 && (
          <>
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
          </>
        )}
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
  })
}
