import {
  CreateFolderSchema,
  canManageFolder,
  checkFolderMove,
  hasPermission,
  ListFoldersQuerySchema,
  MAX_FOLDER_DEPTH,
  tagKey,
  UpdateFolderSchema,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { type FolderTree, loadFolderTree as loadTree } from "../lib/folder-tree"
import { badRequest, conflict, forbidden, notFound, parseJson, parseQuery } from "../lib/http"
import { resolveTags, TAG_SELECT } from "../lib/labels"
import { actor, assertCanManageFolder } from "../lib/permissions"
import { requireOrg } from "../middleware/session"

type Tree = FolderTree

/** Sibling names are unique (case-insensitive) so breadcrumbs and "Move to…" stay unambiguous. */
function assertNameFree(tree: Tree, parentId: string | null, name: string, exceptId?: string) {
  const taken = tree.rows.some(
    (f) =>
      f.parentId === parentId &&
      f.id !== exceptId &&
      f.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
  )
  if (taken) conflict(`A folder named “${name}” already exists here`)
}

function assertMovable(tree: Tree, folderId: string, parentId: string | null) {
  const problem = checkFolderMove(folderId, parentId, tree.parentOf)
  if (problem === "cycle") badRequest("A folder can't move into itself or one of its subfolders")
  if (problem === "too-deep") badRequest(`Folders nest at most ${MAX_FOLDER_DEPTH} levels deep`)
}

/**
 * Folders on the Documents page (ADR 0022). Organisation only: moving a document never changes
 * its envelopes. Deleting a folder moves its documents and subfolders up to its parent.
 */
export const folders = new Hono<AppEnv>()
  .use(requireOrg)

  /**
   * `?parentId=` (omitted = root): that folder, its breadcrumb path and its subfolders with
   * counts. `?all=1`: every folder with its path, for "Move to…". `q` (names and tags), `tag` and
   * `color` search every folder instead of listing one level (ADR 0025); each match has its path.
   */
  .get("/", async (c) => {
    const orgId = c.get("organizationId")
    const query = parseQuery(c, ListFoldersQuerySchema)
    const tree = await loadTree(orgId)
    const me = actor(c)
    const permissions = (f: { createdById: string }) => ({ manage: canManageFolder(me, f) })

    if (query.all) {
      return c.json({
        items: tree.rows.map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          path: tree.pathOf(f.id),
          color: f.color,
          tags: f.tags,
          permissions: permissions(f),
        })),
      })
    }

    const everywhere = Boolean(query.q || query.tag || query.color)
    const q = query.q ? tagKey(query.q) : null
    const tag = query.tag ? tagKey(query.tag) : null
    const matches = (f: Tree["rows"][number]) =>
      (!q || tagKey(f.name).includes(q) || f.tags.some((t) => tagKey(t.name).includes(q))) &&
      (!tag || f.tags.some((t) => tagKey(t.name) === tag)) &&
      (!query.color || f.color === query.color)

    const parentId = query.parentId ?? null
    const folder = parentId ? tree.byId.get(parentId) : null
    if (parentId && !folder) notFound("Folder")

    const children = tree.rows.filter((f) =>
      everywhere ? matches(f) : f.parentId === parentId && matches(f),
    )
    const ids = children.map((f) => f.id)
    const docCounts = ids.length
      ? await prisma.document.groupBy({
          by: ["folderId"],
          where: forOrganization(orgId).document({
            folderId: { in: ids },
            status: { not: "UPLOADING" },
          }),
          _count: { _all: true },
        })
      : []
    const docsIn = new Map(docCounts.map((r) => [r.folderId, r._count._all]))
    // Who created each listed folder, for the Documents list's Sender column (avatar + name).
    const creators = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: [...new Set(children.map((f) => f.createdById))] } },
          select: { id: true, name: true, image: true },
        })
      ).map((u) => [u.id, u]),
    )

    return c.json({
      folder: folder
        ? {
            id: folder.id,
            name: folder.name,
            parentId: folder.parentId,
            color: folder.color,
            tags: folder.tags,
            permissions: permissions(folder),
          }
        : null,
      path: parentId ? tree.pathOf(parentId) : [],
      items: children.map((f) => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt,
        createdBy: creators.get(f.createdById) ?? null,
        documentCount: docsIn.get(f.id) ?? 0,
        folderCount: tree.rows.filter((x) => x.parentId === f.id).length,
        color: f.color,
        tags: f.tags,
        // Search results come from anywhere: where each one lives (its parent's path).
        ...(everywhere && { path: f.parentId ? tree.pathOf(f.parentId) : [] }),
        permissions: permissions(f),
      })),
      permissions: { create: hasPermission(me.role, { folder: ["create"] }) },
    })
  })

  .post("/", async (c) => {
    const input = await parseJson(c, CreateFolderSchema)
    const orgId = c.get("organizationId")
    if (!hasPermission(c.get("memberRole"), { folder: ["create"] })) {
      forbidden("Your role can't create folders")
    }
    const tree = await loadTree(orgId)
    const parentId = input.parentId ?? null
    if (parentId && !tree.byId.has(parentId)) notFound("Parent folder")
    assertNameFree(tree, parentId, input.name)
    assertMovable(tree, crypto.randomUUID(), parentId)
    const tags = input.tags && (await resolveTags(orgId, input.tags))
    const folder = await prisma.folder.create({
      data: {
        organizationId: orgId,
        createdById: c.get("user").id,
        parentId,
        name: input.name,
        color: input.color ?? null,
        ...(tags && { tags: { connect: tags } }),
      },
      include: { tags: TAG_SELECT },
    })
    return c.json({ folder }, 201)
  })

  /** Rename, move and/or set the colour and tags. */
  .patch("/:id", async (c) => {
    const input = await parseJson(c, UpdateFolderSchema)
    const orgId = c.get("organizationId")
    const tree = await loadTree(orgId)
    const folder = tree.byId.get(c.req.param("id"))
    if (!folder) notFound("Folder")
    assertCanManageFolder(c, folder)
    const parentId = input.parentId === undefined ? folder.parentId : input.parentId
    if (parentId && !tree.byId.has(parentId)) notFound("Parent folder")
    if (parentId !== folder.parentId) assertMovable(tree, folder.id, parentId)
    assertNameFree(tree, parentId, input.name ?? folder.name, folder.id)
    const tags = input.tags && (await resolveTags(orgId, input.tags))
    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: {
        parentId,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.color !== undefined && { color: input.color }),
        ...(tags && { tags: { set: tags } }),
      },
      include: { tags: TAG_SELECT },
    })
    return c.json({ folder: updated })
  })

  /** Documents and subfolders move up to the parent; nothing else is deleted. */
  .delete("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const folder = await prisma.folder.findFirst({ where: scope.folder({ id: c.req.param("id") }) })
    if (!folder) notFound("Folder")
    assertCanManageFolder(c, folder)
    // Subfolder names may clash with the parent's own; such moves keep both (rename later).
    await prisma.$transaction([
      // Soft-deleted documents too, so the FK's SET NULL never silently sends them to the root.
      prisma.document.updateMany({
        where: { organizationId: folder.organizationId, folderId: folder.id },
        data: { folderId: folder.parentId },
      }),
      prisma.folder.updateMany({
        where: scope.folder({ parentId: folder.id }),
        data: { parentId: folder.parentId },
      }),
      prisma.folder.delete({ where: { id: folder.id } }),
    ])
    return c.body(null, 204)
  })
