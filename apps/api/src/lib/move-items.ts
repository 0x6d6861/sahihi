import {
  canManageEnvelope,
  canManageFolder,
  canManageTemplate,
  canMoveDocument,
  checkFoldersMove,
  isInsideMovingFolder,
  MAX_FOLDER_DEPTH,
  type MovableKind,
} from "@sahihi/core"
import { forOrganization, type Prisma, prisma } from "@sahihi/db"
import type { Context } from "hono"
import type { AppEnv } from "./env"
import { assertNamesFree, type FolderTree, loadFolderTree } from "./folder-tree"
import { badRequest, forbidden, notFound } from "./http"
import { actor } from "./permissions"

/**
 * Moving several documents, envelopes, templates and folders at once (ADR 0039). Items inside a
 * folder that is also moving stay in it and travel along. `POST
 * /files/move` and `POST /files/group` share the lookups, the checks and the writes. Every item
 * is loaded through the tenant scope; one that's missing is a 404, one the caller may not move a
 * 403, and nothing moves.
 */

type ItemRef = { kind: MovableKind; id: string }

export async function loadMovableItems(c: Context<AppEnv>, items: readonly ItemRef[]) {
  const orgId = c.get("organizationId")
  const scope = forOrganization(orgId)
  const me = actor(c)
  const ids = (kind: MovableKind) => items.filter((i) => i.kind === kind).map((i) => i.id)

  const [tree, documents, envelopes, templates] = await Promise.all([
    loadFolderTree(orgId),
    prisma.document.findMany({
      where: scope.document({ id: { in: ids("document") }, status: { not: "UPLOADING" } }),
      select: { id: true, name: true, uploadedById: true, folderId: true },
    }),
    prisma.envelope.findMany({
      where: scope.envelope({ id: { in: ids("envelope") } }),
      select: { id: true, title: true, createdById: true, folderId: true },
    }),
    prisma.template.findMany({
      where: scope.template({ id: { in: ids("template") } }),
      select: { id: true, name: true, createdById: true, folderId: true },
    }),
  ])
  const folderIds = ids("folder")
  const folders = folderIds.flatMap((id) => tree.byId.get(id) ?? [])
  if (
    documents.length !== ids("document").length ||
    envelopes.length !== ids("envelope").length ||
    templates.length !== ids("template").length ||
    folders.length !== folderIds.length
  ) {
    notFound("Item")
  }

  const refuse = (name: string) =>
    forbidden(`You can't move “${name}”: only its owner, an admin or the owner can`)
  for (const d of documents) if (!canMoveDocument(me, d)) refuse(d.name)
  for (const e of envelopes) if (!canManageEnvelope(me, e)) refuse(e.title)
  for (const t of templates) if (!canManageTemplate(me, t)) refuse(t.name)
  for (const f of folders) if (!canManageFolder(me, f)) refuse(f.name)

  // Picked along with a folder they're in (select-all, a search): they travel with it.
  const moving = new Set(folderIds)
  const free = (folderId: string | null) => !isInsideMovingFolder(folderId, moving, tree.parentOf)
  const topFolders = folders.filter((f) => free(f.parentId))
  return {
    tree,
    documents: documents.filter((d) => free(d.folderId)),
    envelopes: envelopes.filter((e) => free(e.folderId)),
    templates: templates.filter((t) => free(t.folderId)),
    folders: topFolders,
    folderIds: topFolders.map((f) => f.id),
  }
}

export type MovableItems = Awaited<ReturnType<typeof loadMovableItems>>

/** The folders can go under `target` (no cycle, not too deep, no name clash). */
export function assertFoldersCanMove(
  tree: FolderTree,
  folderIds: string[],
  target: string | null,
  parentOf: ReadonlyMap<string, string | null> = tree.parentOf,
) {
  const problem = checkFoldersMove(folderIds, target, parentOf)
  if (problem === "cycle") badRequest("A folder can't move into itself or one of its subfolders")
  if (problem === "too-deep") badRequest(`Folders nest at most ${MAX_FOLDER_DEPTH} levels deep`)
  assertNamesFree(tree, target, folderIds)
}

/** Every item into `target` (null = root), inside the caller's transaction. */
export async function moveItems(
  tx: Prisma.TransactionClient,
  organizationId: string,
  items: MovableItems,
  target: string | null,
) {
  const scope = forOrganization(organizationId)
  await tx.document.updateMany({
    where: scope.document({ id: { in: items.documents.map((d) => d.id) } }),
    data: { folderId: target },
  })
  await tx.envelope.updateMany({
    where: scope.envelope({ id: { in: items.envelopes.map((e) => e.id) } }),
    data: { folderId: target },
  })
  await tx.template.updateMany({
    where: scope.template({ id: { in: items.templates.map((t) => t.id) } }),
    data: { folderId: target },
  })
  await tx.folder.updateMany({
    where: scope.folder({ id: { in: items.folderIds } }),
    data: { parentId: target },
  })
}

/** How many items actually moved (those inside a moving folder don't count). */
export const movedCount = (items: MovableItems) =>
  items.documents.length + items.envelopes.length + items.templates.length + items.folders.length

/** Where each item was, so the client can undo. */
export function movedFrom(items: MovableItems) {
  return [
    ...items.documents.map((d) => ({ kind: "document" as const, id: d.id, folderId: d.folderId })),
    ...items.envelopes.map((e) => ({ kind: "envelope" as const, id: e.id, folderId: e.folderId })),
    ...items.templates.map((t) => ({ kind: "template" as const, id: t.id, folderId: t.folderId })),
    ...items.folders.map((f) => ({ kind: "folder" as const, id: f.id, folderId: f.parentId })),
  ]
}
