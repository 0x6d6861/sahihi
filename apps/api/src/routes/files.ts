import {
  FILES_PAGE_SIZE,
  type FileKind,
  fileKindsFor,
  ListFilesQuerySchema,
  mergeNewestFirst,
  parseFileStatus,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { assertFolderInOrg } from "../lib/folder-tree"
import { parseQuery } from "../lib/http"
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
export const files = new Hono<AppEnv>().use(requireOrg).get("/", async (c) => {
  const orgId = c.get("organizationId")
  const scope = forOrganization(orgId)
  const query = parseQuery(c, ListFilesQuerySchema)
  if (query.folderId) await assertFolderInOrg(orgId, query.folderId)
  const kinds = new Set<FileKind>(fileKindsFor(query))
  const status = query.status ? parseFileStatus(query.status) : undefined
  const filters = query
  const take = query.page * FILES_PAGE_SIZE

  const documentsWhere = scope.document(
    documentWhere({ ...filters, status: status?.kind === "document" ? status.status : undefined }),
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
      documents.map((d, i) => ({ kind: "document" as const, id: d.id, createdAt: d.createdAt, i })),
      envelopes.map((e, i) => ({ kind: "envelope" as const, id: e.id, createdAt: e.createdAt, i })),
      templates.map((t, i) => ({ kind: "template" as const, id: t.id, createdAt: t.createdAt, i })),
    ],
    query.page,
    FILES_PAGE_SIZE,
  )
  const items = await Promise.all(
    page.map(async ({ kind, i }) => {
      if (kind === "document") {
        return { kind, ...(await documentListItem(documents[i] as (typeof documents)[number], me)) }
      }
      if (kind === "envelope") {
        return { kind, ...(await envelopeListItem(envelopes[i] as (typeof envelopes)[number], me)) }
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
