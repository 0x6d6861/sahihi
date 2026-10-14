import { canUseAssistant, SEARCH_INDEX_LIMIT, type SearchIndex } from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { Hono } from "hono"
import { assistantConfigured } from "../lib/assistant/model"
import type { AppEnv } from "../lib/env"
import { requireOrg } from "../middleware/session"
import { workspaceAiEnabled } from "./generated-documents"

const newestFirst = [{ updatedAt: "desc" as const }, { id: "desc" as const }]
// One extra row per kind tells whether the index was cut off.
const take = SEARCH_INDEX_LIMIT + 1

/**
 * The global search index (ADR 0056): the newest folders, documents, envelopes, templates and,
 * when the assistant is available to the caller, drafts of the active workspace, as titles plus
 * what a search should match. The command palette filters it in the browser.
 */
export const search = new Hono<AppEnv>().use(requireOrg).get("/", async (c) => {
  const orgId = c.get("organizationId")
  const scope = forOrganization(orgId)
  const withDrafts =
    assistantConfigured() &&
    canUseAssistant(c.get("memberRole")) &&
    (await workspaceAiEnabled(orgId))

  const [folders, documents, envelopes, templates, drafts] = await Promise.all([
    prisma.folder.findMany({
      where: scope.folder(),
      orderBy: newestFirst,
      take,
      select: { id: true, name: true },
    }),
    prisma.document.findMany({
      where: scope.document({ status: { not: "UPLOADING" } }),
      orderBy: newestFirst,
      take,
      select: { id: true, name: true, status: true },
    }),
    prisma.envelope.findMany({
      where: scope.envelope(),
      orderBy: newestFirst,
      take,
      select: {
        id: true,
        title: true,
        status: true,
        recipients: { select: { name: true, email: true } },
      },
    }),
    prisma.template.findMany({
      where: scope.template(),
      orderBy: newestFirst,
      take,
      select: { id: true, name: true },
    }),
    withDrafts
      ? prisma.generatedDocument.findMany({
          where: scope.generatedDocument(),
          orderBy: newestFirst,
          take,
          select: { id: true, title: true },
        })
      : [],
  ])

  const truncated = [folders, documents, envelopes, templates, drafts].some(
    (rows) => rows.length > SEARCH_INDEX_LIMIT,
  )
  const cap = <T>(rows: T[]) => rows.slice(0, SEARCH_INDEX_LIMIT)
  const index: SearchIndex = {
    truncated,
    items: [
      ...cap(folders).map((f) => ({ kind: "folder" as const, id: f.id, title: f.name })),
      ...cap(documents).map((d) => ({
        kind: "document" as const,
        id: d.id,
        title: d.name,
        status: d.status,
      })),
      ...cap(envelopes).map((e) => ({
        kind: "envelope" as const,
        id: e.id,
        title: e.title,
        status: e.status,
        people: e.recipients.flatMap((r) => [r.name, r.email]),
      })),
      ...cap(templates).map((t) => ({ kind: "template" as const, id: t.id, title: t.name })),
      ...cap(drafts).map((d) => ({ kind: "draft" as const, id: d.id, title: d.title })),
    ],
  }
  return c.json(index)
})
