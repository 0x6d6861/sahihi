import { getEnv } from "@sahihi/config"
import { sha256Hex } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import {
  createLogger,
  enqueueDocumentConversion,
  enqueueDocumentThumbnail,
  keys,
  releaseObject,
  storageFor,
} from "@sahihi/infra"
import { ConversionError, convertDocxToPdf, inspectPdf, PdfInspectionError } from "@sahihi/pdf"

const log = createLogger("worker")

/** When a conversion keeps failing for reasons of ours (not the file's), the sender reads this. */
const GAVE_UP = "This Word document couldn't be converted. Try again, or upload it as a PDF."

/**
 * Converts a CONVERTING document's Word upload to its PDF (ADR 0052, docs/pdf-pipeline.md → Word
 * uploads), then makes it READY exactly as `complete` does for a PDF: inspected, hashed, stored at
 * `original.pdf` in the workspace's storage, thumbnail queued. The Word file is then discarded.
 *
 * Idempotent: anything not CONVERTING is skipped, and a PDF a crashed attempt already stored is
 * used as it is (keys are written once). A file LibreOffice or the PDF check refuses fails the
 * document at once; other errors throw so BullMQ retries, and the last attempt fails it.
 */
export async function convertDocument(documentId: string, { isFinal }: { isFinal: boolean }) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, organizationId: true, s3Key: true, status: true, deletedAt: true },
  })
  if (doc?.status !== "CONVERTING") return { skipped: true }
  const storage = await storageFor(doc.organizationId)
  const source = keys.wordUpload(doc.organizationId, doc.id)
  if (doc.deletedAt) {
    await fail(doc.id, "Deleted before it was converted")
    await storage.discardUpload(source)
    return { skipped: true }
  }

  try {
    let pdf: Uint8Array
    if (await storage.head(doc.s3Key)) {
      pdf = await storage.get(doc.s3Key)
    } else {
      if (!(await storage.uploaded(source))) {
        await fail(doc.id, "The uploaded Word document wasn't found. Upload it again.")
        return { converted: false, reason: "missing" }
      }
      pdf = await convertDocxToPdf(await storage.readUpload(source), {
        command: getEnv().LIBREOFFICE_PATH,
      })
    }
    const info = await inspectPdf(pdf)
    if (!(await storage.head(doc.s3Key))) await storage.put(doc.s3Key, pdf, "application/pdf")
    const res = await prisma.document.updateMany({
      where: { id: doc.id, status: "CONVERTING", deletedAt: null },
      data: {
        status: "READY",
        sha256: await sha256Hex(pdf),
        sizeBytes: pdf.byteLength,
        pageCount: info.pageCount,
        pages: info.pages as unknown as object,
      },
    })
    if (res.count === 0) {
      // Swept or deleted while converting: the PDF has no document.
      await releaseObject(doc.organizationId, doc.s3Key, "UPLOAD_REJECTED").catch(() => {})
      return { skipped: true }
    }
    await storage
      .discardUpload(source)
      .catch((err: unknown) => log.warn("Word upload not removed", { key: source, err }))
    await enqueueDocumentThumbnail(doc.id).catch((err: unknown) =>
      log.warn("thumbnail not queued", { documentId, err }),
    )
    return { converted: true, pages: info.pageCount, bytes: pdf.byteLength }
  } catch (err) {
    if (err instanceof ConversionError || err instanceof PdfInspectionError) {
      log.warn("Word document not converted", {
        documentId,
        reason: err.code,
        detail: err instanceof ConversionError ? String(err.cause ?? "") : undefined,
      })
      await fail(doc.id, err.message)
      await storage.discardUpload(source).catch(() => {})
      return { converted: false, reason: err.code }
    }
    if (isFinal) {
      await fail(doc.id, GAVE_UP)
      await storage.discardUpload(source).catch(() => {})
    }
    throw err
  }
}

async function fail(documentId: string, reason: string) {
  await prisma.document.updateMany({
    where: { id: documentId, status: "CONVERTING" },
    data: { status: "FAILED", failureReason: reason.slice(0, 500) },
  })
}

/** Conversions waiting longer than this were lost (a Redis restart): queue them again. */
const REQUEUE_AFTER_MS = 5 * 60_000

/**
 * Part of the uploads sweep: re-queue conversions whose job was lost. The job id is the document
 * id, so a conversion still queued or running isn't queued twice.
 */
export async function requeueLostConversions(now = new Date(), cutoff: Date) {
  const waiting = await prisma.document.findMany({
    where: {
      status: "CONVERTING",
      deletedAt: null,
      updatedAt: { lt: new Date(now.getTime() - REQUEUE_AFTER_MS), gte: cutoff },
    },
    select: { id: true },
    take: 200,
  })
  for (const { id } of waiting) await enqueueDocumentConversion(id)
  return waiting.length
}
