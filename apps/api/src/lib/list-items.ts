import { type Actor, canManageEnvelope, canManageTemplate, canMoveDocument } from "@sahihi/core"
import type { Prisma } from "@sahihi/db"
import { presignCacheable } from "@sahihi/infra"
import { TAG_SELECT } from "./labels"

/**
 * What a row of the Documents, Envelopes and Templates lists carries (ADR 0033, 0036, 0038): one
 * `include` and one serializer per type, so `/api/files` returns exactly the rows the type pages
 * do and the web reuses their cards and menus.
 */

const firstDocuments = {
  orderBy: { order: "asc" },
  select: {
    document: { select: { id: true, name: true, pageCount: true, thumbnailKey: true } },
  },
} as const

const person = { select: { id: true, name: true, image: true } } as const
const folderRef = { select: { id: true, name: true } } as const

export const documentListInclude = {
  // Sent envelopes freeze the name (it's on the signing page and the certificate).
  _count: {
    select: { envelopeDocuments: { where: { envelope: { status: { not: "DRAFT" } } } } },
  },
  source: { select: { id: true, name: true, deletedAt: true } },
  uploadedBy: person,
  folder: folderRef,
  tags: TAG_SELECT,
} satisfies Prisma.DocumentInclude

export const envelopeListInclude = {
  documents: firstDocuments,
  recipients: {
    select: { id: true, name: true, status: true, role: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  },
  createdBy: person,
  folder: folderRef,
  tags: TAG_SELECT,
} satisfies Prisma.EnvelopeInclude

export const templateListInclude = {
  documents: firstDocuments,
  createdBy: person,
  roles: { select: { label: true, role: true }, orderBy: { order: "asc" } },
  _count: { select: { fields: true } },
  folder: folderRef,
  tags: TAG_SELECT,
} satisfies Prisma.TemplateInclude

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentListInclude }>
type EnvelopeRow = Prisma.EnvelopeGetPayload<{ include: typeof envelopeListInclude }>
type TemplateRow = Prisma.TemplateGetPayload<{ include: typeof templateListInclude }>

/** Cacheable presigned URL (ADR 0033); null until the worker has rendered it. */
const thumbnail = (key: string | null | undefined) => (key ? presignCacheable(key) : null)

/** The documents in order with the first one apart (rows show it and "+ N more"; ADR 0037). */
function documentsOf(rows: EnvelopeRow["documents"]) {
  const docs = rows.map(({ document: { thumbnailKey: _key, ...d } }) => d)
  return { document: docs[0] ?? null, documents: docs }
}

export async function documentListItem(d: DocumentRow, me: Actor) {
  const mine = canMoveDocument(me, d)
  return {
    ...d,
    thumbnailUrl: await thumbnail(d.thumbnailKey),
    permissions: { move: mine, label: mine, rename: mine && d._count.envelopeDocuments === 0 },
  }
}

export async function envelopeListItem({ documents, ...e }: EnvelopeRow, me: Actor) {
  return {
    ...e,
    ...documentsOf(documents),
    thumbnailUrl: await thumbnail(documents[0]?.document.thumbnailKey),
    permissions: { manage: canManageEnvelope(me, e) },
  }
}

export async function templateListItem({ createdById, documents, ...t }: TemplateRow, me: Actor) {
  return {
    ...t,
    ...documentsOf(documents),
    thumbnailUrl: await thumbnail(documents[0]?.document.thumbnailKey),
    permissions: { manage: canManageTemplate(me, { createdById }) },
  }
}
