import { prisma } from "@sahihi/db"
import {
  createLogger,
  deleteObject,
  enqueueDocumentThumbnail,
  getObjectBytes,
  keys,
  putObject,
} from "@sahihi/infra"
import { renderThumbnail } from "@sahihi/pdf"

const log = createLogger("worker")

const SWEEP_BATCH = 200

/**
 * Renders a READY document's first page to `thumbnail.png` next to the original (ADR 0033).
 * Idempotent: a document that already has one, or is gone, is skipped. A file PDFium can't render
 * records `thumbnailError` (the grid then shows a file icon) instead of retrying forever; storage
 * and database errors throw so BullMQ retries them.
 */
export async function renderDocumentThumbnail(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      organizationId: true,
      s3Key: true,
      status: true,
      deletedAt: true,
      thumbnailKey: true,
    },
  })
  if (doc?.status !== "READY" || doc.deletedAt || doc.thumbnailKey) {
    return { skipped: true }
  }

  const bytes = await getObjectBytes(doc.s3Key)
  let png: Uint8Array
  try {
    png = (await renderThumbnail(bytes)).png
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn("thumbnail not rendered", { documentId, err: message })
    await prisma.document.updateMany({
      where: { id: documentId, thumbnailKey: null },
      data: { thumbnailError: message.slice(0, 500) },
    })
    return { rendered: false }
  }

  const key = keys.thumbnail(doc.organizationId, documentId)
  await putObject(key, png, "image/png")
  const res = await prisma.document.updateMany({
    where: { id: documentId, deletedAt: null },
    data: { thumbnailKey: key, thumbnailError: null },
  })
  // Deleted while rendering: don't leave the image behind.
  if (res.count === 0) await deleteObject(key).catch(() => {})
  return { rendered: res.count > 0, bytes: png.byteLength }
}

/**
 * Hourly: queue READY documents with no thumbnail and no recorded failure. Backfills documents
 * uploaded before thumbnails existed and recovers jobs lost to a Redis restart.
 */
export async function sweepThumbnails() {
  const missing = await prisma.document.findMany({
    where: { status: "READY", deletedAt: null, thumbnailKey: null, thumbnailError: null },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: SWEEP_BATCH,
  })
  for (const { id } of missing) await enqueueDocumentThumbnail(id)
  return { queued: missing.length }
}
