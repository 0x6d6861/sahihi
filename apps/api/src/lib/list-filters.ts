import {
  type DocumentPeriod,
  type DocumentStatus,
  ENVELOPE_STAGE_STATUSES,
  type EnvelopeStage,
  periodStart,
} from "@sahihi/core"
import type { Prisma } from "@sahihi/db"
import { hasTag, tagMatches } from "./labels"

/**
 * The list filters of Documents, Envelopes, Templates and All files (ADR 0022, 0036, 0038), one
 * builder per type so the type pages and `/api/files` agree. Not scoped: wrap the result in
 * `forOrganization(orgId).<model>(…)`.
 *
 * Folders: without `q`, `tag` or `color` the list is one folder (`folderId`, omitted = root);
 * with any of them it searches every folder.
 */
interface CommonFilters {
  folderId?: string
  q?: string
  period?: DocumentPeriod
  tag?: string
  color?: string
  /** Who added it: uploader, sender or saver. */
  ownerId?: string
}

/** True when the query searches every folder instead of listing one. */
export const searchesEverywhere = (f: { q?: string; tag?: string; color?: string }) =>
  Boolean(f.q || f.tag || f.color)

function common(f: CommonFilters) {
  return {
    ...(!searchesEverywhere(f) && { folderId: f.folderId ?? null }),
    ...(f.tag && { tags: hasTag(f.tag) }),
    ...(f.color && { color: f.color }),
    ...(f.period && { createdAt: { gte: periodStart(f.period, new Date()) } }),
  }
}

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const })

export function documentWhere(
  f: CommonFilters & { status?: DocumentStatus },
): Prisma.DocumentWhereInput {
  return {
    ...common(f),
    status: f.status ?? { not: "UPLOADING" },
    ...(f.ownerId && { uploadedById: f.ownerId }),
    ...(f.q && { OR: [{ name: contains(f.q) }, { tags: tagMatches(f.q) }] }),
  }
}

export function envelopeWhere(
  f: CommonFilters & { stage?: EnvelopeStage },
): Prisma.EnvelopeWhereInput {
  return {
    ...common(f),
    ...(f.stage && { status: { in: [...ENVELOPE_STAGE_STATUSES[f.stage]] } }),
    ...(f.ownerId && { createdById: f.ownerId }),
    ...(f.q && {
      OR: [
        { title: contains(f.q) },
        { tags: tagMatches(f.q) },
        { documents: { some: { document: { name: contains(f.q) } } } },
        { recipients: { some: { OR: [{ name: contains(f.q) }, { email: contains(f.q) }] } } },
      ],
    }),
  }
}

export function templateWhere(f: CommonFilters): Prisma.TemplateWhereInput {
  return {
    ...common(f),
    ...(f.ownerId && { createdById: f.ownerId }),
    ...(f.q && {
      OR: [
        { name: contains(f.q) },
        { description: contains(f.q) },
        { tags: tagMatches(f.q) },
        { documents: { some: { document: { name: contains(f.q) } } } },
      ],
    }),
  }
}
