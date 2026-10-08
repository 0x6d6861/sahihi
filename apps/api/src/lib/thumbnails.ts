import { createLogger, enqueueDocumentThumbnail } from "@sahihi/infra"

const log = createLogger("api")

/**
 * Queue a READY document's thumbnail (ADR 0033). It's a nicety: if Redis is down the upload still
 * succeeds, and the hourly sweep queues the document later.
 */
export async function queueThumbnail(documentId: string) {
  await enqueueDocumentThumbnail(documentId).catch((err: unknown) =>
    log.warn("thumbnail not queued", { documentId, err }),
  )
}
