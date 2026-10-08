import {
  checkFolderMove,
  FILES_PAGE_SIZE,
  type FileKind,
  fileKindsFor,
  GroupItemsSchema,
  hasPermission,
  ListFilesQuerySchema,
  MAX_FOLDER_DEPTH,
  MoveItemsSchema,
  mergeNewestFirst,
  NEW_FOLDER_NAME,
  parseFileStatus,
  uniqueFolderName,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { assertFolderInOrg } from "../lib/folder-tree"
import { badRequest, forbidden, notFound, parseJson, parseQuery } from "../lib/http"
import { colorsInUse, tagsInUse } from "../lib/labels"
import { documentWhere, envelopeWhere, templateWhere } from "../lib/list-filters"
import {
  documentListInclude,
  documentListItem,
  envelopeListInclude,
  envelopeListItem,
  templateListInclude,
  templateListItem,
} from "../lib/list-items"
import { assertFoldersCanMove, loadMovableItems, movedFrom, moveItems } from "../lib/move-items"
import { actor } from "../lib/permissions"
import { requireOrg } from "../middleware/session"

const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }]

/**
 * All files (ADR 0038): the workspace's documents, envelopes and templates in one list, newest
 * first, 25 a page. Each row is the same as on its type's own list, plus `kind`. Folders come
 * from `GET /folders` as on the type pages.
 *
 * Paging merges the three lists: for page N each type reads its first N × 25 rows, so the page is
 * exact; `MAX_FILES_PAGE` caps the cost.
 */
export const files = new Hono<AppEnv>()
  .use(requireOrg)
  .get("/", async (c) => {
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const query = parseQuery(c, ListFilesQuerySchema)
    if (query.folderId) await assertFolderInOrg(orgId, query.folderId)
    const kinds = new Set<FileKind>(fileKindsFor(query))
    const status = query.status ? parseFileStatus(query.status) : undefined
    const filters = query
    const take = query.page * FILES_PAGE_SIZE

    const documentsWhere = scope.document(
      documentWhere({
        ...filters,
        status: status?.kind === "document" ? status.status : undefined,
      }),
    )
    const envelopesWhere = scope.envelope(
      envelopeWhere({ ...filters, stage: status?.kind === "envelope" ? status.stage : undefined }),
    )
    const templatesWhere = scope.template(templateWhere(filters))

    const [documents, envelopes, templates, counts, people, tags, colors] = await Promise.all([
      kinds.has("document")
        ? prisma.document.findMany({
            where: documentsWhere,
            orderBy: newestFirst,
            take,
            include: documentListInclude,
          })
        : [],
      kinds.has("envelope")
        ? prisma.envelope.findMany({
            where: envelopesWhere,
            orderBy: newestFirst,
            take,
            include: envelopeListInclude,
          })
        : [],
      kinds.has("template")
        ? prisma.template.findMany({
            where: templatesWhere,
            orderBy: newestFirst,
            take,
            include: templateListInclude,
          })
        : [],
      Promise.all([
        kinds.has("document") ? prisma.document.count({ where: documentsWhere }) : 0,
        kinds.has("envelope") ? prisma.envelope.count({ where: envelopesWhere }) : 0,
        kinds.has("template") ? prisma.template.count({ where: templatesWhere }) : 0,
      ]),
      // "People" chip options: whoever uploaded, sent or saved something in this workspace.
      prisma.user.findMany({
        where: {
          OR: [
            { documents: { some: scope.document({ status: { not: "UPLOADING" } }) } },
            { envelopes: { some: scope.envelope() } },
            { templates: { some: scope.template() } },
          ],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      tagsInUse(orgId),
      colorsInUse(orgId),
    ])

    const me = actor(c)
    const page = mergeNewestFirst<{ kind: FileKind; id: string; createdAt: Date; i: number }>(
      [
        documents.map((d, i) => ({
          kind: "document" as const,
          id: d.id,
          createdAt: d.createdAt,
          i,
        })),
        envelopes.map((e, i) => ({
          kind: "envelope" as const,
          id: e.id,
          createdAt: e.createdAt,
          i,
        })),
        templates.map((t, i) => ({
          kind: "template" as const,
          id: t.id,
          createdAt: t.createdAt,
          i,
        })),
      ],
      query.page,
      FILES_PAGE_SIZE,
    )
    const items = await Promise.all(
      page.map(async ({ kind, i }) => {
        if (kind === "document") {
          return {
            kind,
            ...(await documentListItem(documents[i] as (typeof documents)[number], me)),
          }
        }
        if (kind === "envelope") {
          return {
            kind,
            ...(await envelopeListItem(envelopes[i] as (typeof envelopes)[number], me)),
          }
        }
        return { kind, ...(await templateListItem(templates[i] as (typeof templates)[number], me)) }
      }),
    )
    const [documentCount, envelopeCount, templateCount] = counts
    return c.json({
      items,
      page: query.page,
      pageSize: FILES_PAGE_SIZE,
      total: documentCount + envelopeCount + templateCount,
      counts: { document: documentCount, envelope: envelopeCount, template: templateCount },
      people,
      tags,
      colors,
    })
  })

  /**
   * Move documents, envelopes, templates and folders into one folder (`folderId: null` = root):
   * drag and drop, or "Move…" on a selection (ADR 0039). All or nothing: any item missing (404),
   * not the caller's to move (403) or a folder move that breaks the tree (400, 409) moves nothing.
   * Organisation only, like a single move (ADR 0038): no audit event. `from` is where each item
   * was, so the client can undo.
   */
  .post("/move", async (c) => {
    const input = await parseJson(c, MoveItemsSchema)
    const orgId = c.get("organizationId")
    const target = input.folderId
    const items = await loadMovableItems(c, input.items)
    if (target && !items.tree.byId.has(target)) notFound("Folder")
    assertFoldersCanMove(items.tree, items.folderIds, target)
    await prisma.$transaction((tx) => moveItems(tx, orgId, items, target))
    return c.json({ moved: input.items.length, from: movedFrom(items) })
  })

  /**
   * Drop onto a file (ADR 0039): a new folder in `parentId` (the file's folder) named "New
   * folder" (or the next free "New folder N"), holding every item. Needs `folder:create` and the
   * right to move each item. `from` says where each item was; deleting the folder undoes it when
   * they all came from `parentId` (its contents move up there).
   */
  .post("/group", async (c) => {
    const input = await parseJson(c, GroupItemsSchema)
    const orgId = c.get("organizationId")
    if (!hasPermission(c.get("memberRole"), { folder: ["create"] })) {
      forbidden("Your role can't create folders")
    }
    const parentId = input.parentId
    const items = await loadMovableItems(c, input.items)
    const { tree } = items
    if (parentId && !tree.byId.has(parentId)) notFound("Folder")

    // The new folder isn't in the tree yet: check depth and cycles as if it were.
    const newId = crypto.randomUUID()
    const parentOf = new Map(tree.parentOf).set(newId, parentId)
    if (checkFolderMove(newId, parentId, tree.parentOf)) {
      badRequest(`Folders nest at most ${MAX_FOLDER_DEPTH} levels deep`)
    }
    assertFoldersCanMove(tree, items.folderIds, newId, parentOf)
    const name = uniqueFolderName(
      NEW_FOLDER_NAME,
      tree.rows.filter((f) => f.parentId === parentId).map((f) => f.name),
    )

    const folder = await prisma.$transaction(async (tx) => {
      const created = await tx.folder.create({
        data: { organizationId: orgId, createdById: c.get("user").id, parentId, name },
        select: { id: true, name: true, parentId: true },
      })
      await moveItems(tx, orgId, items, created.id)
      return created
    })
    return c.json({ folder, moved: input.items.length, from: movedFrom(items) }, 201)
  })
