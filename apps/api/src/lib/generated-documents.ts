import {
  type GeneratedDocumentData,
  GeneratedDocumentDataSchema,
  type GenerationActor,
  type GenerationEventType,
  structureIssues,
} from "@sahihi/core"
import { forOrganization, Prisma, prisma } from "@sahihi/db"
import { HTTPException } from "hono/http-exception"
import { conflict, notFound } from "./http"

/**
 * Generated documents (docs/ai-documents.md): versions are append-only, so every change is
 * "read the latest version, derive the next one, append it". Appending names the version it was
 * derived from; if someone else appended first, the unique (document, number) pair makes the
 * insert fail and the caller gets a 409 to reload, instead of silently overwriting their change.
 */

type Tx = Prisma.TransactionClient

export interface LoadedVersion {
  id: string
  number: number
  data: GeneratedDocumentData
  createdAt: Date
}

export async function latestVersion(db: Tx, generatedDocumentId: string): Promise<LoadedVersion> {
  const row = await db.generatedDocumentVersion.findFirst({
    where: { generatedDocumentId },
    orderBy: { number: "desc" },
  })
  if (!row) throw new Error(`Generated document ${generatedDocumentId} has no version`)
  return {
    id: row.id,
    number: row.number,
    // Written only through appendVersion, which validates; parse again so a bad row fails loudly.
    data: GeneratedDocumentDataSchema.parse(row.data),
    createdAt: row.createdAt,
  }
}

/** The document, scoped to the caller's workspace, with its latest version. 404 otherwise. */
export async function loadGeneratedDocument(organizationId: string, id: string) {
  const doc = await prisma.generatedDocument.findFirst({
    where: forOrganization(organizationId).generatedDocument({ id }),
  })
  if (!doc) notFound("Document")
  return { doc, version: await latestVersion(prisma, doc.id) }
}

export async function appendEvent(
  tx: Tx,
  input: {
    generatedDocumentId: string
    type: GenerationEventType
    actor: GenerationActor
    actorUserId: string | null
    versionId?: string | null
    data?: Record<string, unknown>
  },
) {
  await tx.generatedDocumentEvent.create({
    data: {
      generatedDocumentId: input.generatedDocumentId,
      type: input.type,
      actor: input.actor,
      actorUserId: input.actorUserId,
      versionId: input.versionId ?? null,
      data: (input.data ?? Prisma.DbNull) as Prisma.InputJsonValue,
    },
  })
}

/**
 * Row lock for the rest of the transaction: serialises appending against finalising, so a version
 * can't land after the one that was rendered.
 */
export async function lockGeneratedDocument(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM "GeneratedDocument" WHERE id = ${id} FOR UPDATE`
  return rows[0]
}

export class StaleVersionError extends Error {}
export class LockedError extends Error {}

/**
 * Appends the version after `base`, with an event in the same transaction. Refuses a locked
 * (finalised) document, a stale base, and data that breaks the schema or its references.
 */
export async function appendVersion(input: {
  generatedDocumentId: string
  baseVersionId: string
  data: GeneratedDocumentData
  actor: GenerationActor
  userId: string
  reason: string
  event: { type: GenerationEventType; data?: Record<string, unknown> }
}): Promise<LoadedVersion> {
  const data = GeneratedDocumentDataSchema.parse(input.data)
  const issues = structureIssues(data)
  if (issues.length) throw new Error(`Invalid document structure: ${JSON.stringify(issues)}`)
  try {
    return await prisma.$transaction(async (tx) => {
      const doc = await lockGeneratedDocument(tx, input.generatedDocumentId)
      if (doc?.status !== "DRAFT") throw new LockedError()
      const base = await latestVersion(tx, input.generatedDocumentId)
      if (base.id !== input.baseVersionId) throw new StaleVersionError()
      const row = await tx.generatedDocumentVersion.create({
        data: {
          generatedDocumentId: input.generatedDocumentId,
          number: base.number + 1,
          data: data as unknown as Prisma.InputJsonValue,
          actor: input.actor,
          createdById: input.userId,
          reason: input.reason,
        },
      })
      await appendEvent(tx, {
        generatedDocumentId: input.generatedDocumentId,
        type: input.event.type,
        actor: input.actor,
        actorUserId: input.userId,
        versionId: row.id,
        data: input.event.data,
      })
      await tx.generatedDocument.update({
        where: { id: input.generatedDocumentId },
        data: { title: data.title },
      })
      return { id: row.id, number: row.number, data, createdAt: row.createdAt }
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new StaleVersionError()
    }
    throw err
  }
}

/** Maps the two expected append failures onto 409s for routes. */
export async function appendVersionOrConflict(input: Parameters<typeof appendVersion>[0]) {
  try {
    return await appendVersion(input)
  } catch (err) {
    if (err instanceof StaleVersionError) {
      throw new HTTPException(409, {
        res: Response.json(
          {
            error: "stale_version",
            message: "The document changed since you loaded it. Reload to see the latest version.",
          },
          { status: 409 },
        ),
      })
    }
    if (err instanceof LockedError) conflict("This document is finalised and can't change")
    throw err
  }
}
