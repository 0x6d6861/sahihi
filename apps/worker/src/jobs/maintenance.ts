import { getEnv } from "@sahihi/config"
import { abandonedUploadCutoff } from "@sahihi/core"
import {
  appendAuditEvent,
  issueSigningLink,
  notifyEnvelopeOwner,
  prisma,
  queueEnvelopeWebhook,
} from "@sahihi/db"
import { createLogger, deleteObject, enqueueWebhookDeliveries, getQueues } from "@sahihi/infra"

const log = createLogger("worker")

const DAY = 86_400_000
const REMIND_EVERY_DAYS = 3
const MAX_REMINDERS = 3

/** Hourly: move overdue envelopes to EXPIRED and kill their links. */
export async function expireEnvelopes() {
  const overdue = await prisma.envelope.findMany({
    where: { status: { in: ["SENT", "IN_PROGRESS"] }, expiresAt: { lt: new Date() } },
    select: { id: true },
    take: 500,
  })
  for (const { id } of overdue) {
    const webhooks = await prisma.$transaction(async (tx) => {
      const res = await tx.envelope.updateMany({
        where: { id, status: { in: ["SENT", "IN_PROGRESS"] } },
        data: { status: "EXPIRED" },
      })
      if (res.count === 0) return []
      await tx.recipient.updateMany({ where: { envelopeId: id }, data: { tokenHash: null } })
      await appendAuditEvent(tx, { envelopeId: id, type: "envelope.expired" })
      await notifyEnvelopeOwner(tx, { envelopeId: id, type: "envelope.expired" })
      return queueEnvelopeWebhook(tx, { envelopeId: id, type: "envelope.expired" })
    })
    await enqueueWebhookDeliveries(webhooks)
  }
  return { expired: overdue.length }
}

/** Daily: remind recipients who haven't acted. Rotates their link. */
export async function remindRecipients() {
  const cutoff = new Date(Date.now() - REMIND_EVERY_DAYS * DAY)
  const due = await prisma.recipient.findMany({
    where: {
      status: { in: ["SENT", "VIEWED"] },
      // Embedded recipients sign inside the sender's app; they're never emailed.
      delivery: "EMAIL",
      reminderCount: { lt: MAX_REMINDERS },
      notifiedAt: { lt: cutoff },
      OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: cutoff } }],
      envelope: { status: { in: ["SENT", "IN_PROGRESS"] } },
    },
    include: { envelope: { select: { expiresAt: true } } },
    take: 500,
  })
  const ttl = getEnv().SIGNING_LINK_TTL_DAYS * DAY
  for (const r of due) {
    const link = await prisma.$transaction(async (tx) => {
      const l = await issueSigningLink(
        tx,
        r.id,
        new Date(
          Math.min(Date.now() + ttl, r.envelope.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY),
        ),
        { lastRemindedAt: new Date(), reminderCount: { increment: 1 } },
      )
      await appendAuditEvent(tx, {
        envelopeId: r.envelopeId,
        type: "recipient.reminded",
        recipientId: r.id,
        data: { automatic: true },
      })
      return l
    })
    await getQueues().notifications.add("envelope.reminder", link)
  }
  return { reminded: due.length }
}

const SWEEP_BATCH = 500

/**
 * Every 15 min: uploads never completed within an hour become FAILED + soft-deleted, and their
 * storage object (if the PUT landed) is removed. Idempotent: the conditional update skips rows a
 * late `complete` already moved on, and deleting a missing object is a no-op in S3.
 */
export async function sweepAbandonedUploads(now = new Date()) {
  const cutoff = abandonedUploadCutoff(now)
  let swept = 0
  for (;;) {
    const stale = await prisma.document.findMany({
      where: { status: "UPLOADING", createdAt: { lt: cutoff }, deletedAt: null },
      select: { id: true, s3Key: true },
      orderBy: { createdAt: "asc" },
      take: SWEEP_BATCH,
    })
    for (const doc of stale) {
      const res = await prisma.document.updateMany({
        where: { id: doc.id, status: "UPLOADING" },
        data: { status: "FAILED", failureReason: "Upload was not completed", deletedAt: now },
      })
      if (res.count === 0) continue
      swept += 1
      // Missing keys are a no-op in S3, so an error here is a real outage. The row is already
      // swept; log the key so the orphaned (private) object can be removed by hand.
      await deleteObject(doc.s3Key).catch((err: unknown) =>
        log.error("could not delete abandoned upload", { key: doc.s3Key, err }),
      )
    }
    if (stale.length < SWEEP_BATCH) break
  }
  return { swept }
}
