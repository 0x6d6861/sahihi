import { folderPath } from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { conflict, notFound } from "./http"
import { TAG_SELECT } from "./labels"

/**
 * Every folder in the org (id, name, parent, labels). Folder trees are small; one query serves
 * paths, checks and folder search.
 */
export async function loadFolderTree(organizationId: string) {
  const rows = await prisma.folder.findMany({
    where: forOrganization(organizationId).folder(),
    select: {
      id: true,
      name: true,
      parentId: true,
      createdById: true,
      createdAt: true,
      color: true,
      tags: TAG_SELECT,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  })
  const byId = new Map(rows.map((f) => [f.id, f]))
  const parentOf = new Map(rows.map((f) => [f.id, f.parentId]))
  const pathOf = (id: string) =>
    folderPath(id, parentOf).map((p) => ({ id: p, name: byId.get(p)?.name ?? "" }))
  return { rows, byId, parentOf, pathOf }
}

export type FolderTree = Awaited<ReturnType<typeof loadFolderTree>>

/** 404 unless `folderId` is a folder of this workspace (a move target or a list filter). */
export async function assertFolderInOrg(organizationId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({
    where: forOrganization(organizationId).folder({ id: folderId }),
    select: { id: true },
  })
  if (!folder) notFound("Folder")
}

const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0

/**
 * Sibling names are unique (case-insensitive) so breadcrumbs and "Move to…" stay unambiguous.
 * `exceptIds` are folders leaving `parentId` (being renamed or moved), so they don't count.
 */
export function assertNameFree(
  tree: FolderTree,
  parentId: string | null,
  name: string,
  exceptIds: readonly string[] = [],
) {
  const taken = tree.rows.some(
    (f) => f.parentId === parentId && !exceptIds.includes(f.id) && sameName(f.name, name),
  )
  if (taken) conflict(`A folder named “${name}” already exists here`)
}

/** Several folders moving into `parentId` at once: free there, and no two share a name. */
export function assertNamesFree(tree: FolderTree, parentId: string | null, folderIds: string[]) {
  const names: string[] = []
  for (const id of folderIds) {
    const folder = tree.byId.get(id)
    if (!folder || folder.parentId === parentId) continue
    assertNameFree(tree, parentId, folder.name, folderIds)
    if (names.some((n) => sameName(n, folder.name))) {
      conflict(`Two folders named “${folder.name}” can't share one folder`)
    }
    names.push(folder.name)
  }
}
