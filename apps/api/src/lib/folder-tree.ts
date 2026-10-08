import { folderPath } from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { notFound } from "./http"
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
