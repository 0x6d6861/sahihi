import { createReadStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  CLOSED_STATUSES,
  EXPORT_MAX_ENVELOPES,
  EXPORT_TTL_DAYS,
  exportFolderName,
  isClosed,
  NOTIFICATION_TTL_DAYS,
  type PurgeReason,
  REDACTED,
  type RetentionYears,
  retentionCutoff,
  verifyAuditChain,
} from "@sahihi/core"
import { appendAuditEvent, notifyUsers, prisma, toChainedEvent } from "@sahihi/db"
import {
  deleteObject,
  deletePrefix,
  getObjectBytes,
  getQueues,
  keys,
  putObjectStream,
} from "@sahihi/infra"
import { Zip, ZipPassThrough } from "fflate"

/**
 * Retention, export and deletion (docs/data-retention.md, ADR 0015).
 * Purging keeps the evidence (status, timestamps, hashes, certificate code, audit chain) and
 * deletes files and personal data. All jobs are idempotent.
 */

// ── Purge one envelope ───────────────────────────────────────────────────────
export async function purgeEnvelope(envelopeId: string, reason: PurgeReason) {
  const e = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      purgedAt: true,
      documentId: true,
    },
  })
  if (!e || e.purgedAt) return { skipped: true }
  if (!isClosed(e.status)) return { skipped: true, reason: "not closed" }

  // 1. Files: signed PDF, certificate PDF, signature images.
  await deletePrefix(keys.envelopePrefix(e.organizationId, e.id))

  // 2. Personal data, in one transaction with the audit event.
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.envelope.updateMany({
      where: { id: e.id, purgedAt: null },
      data: {
        purgedAt: now,
        title: REDACTED.envelopeTitle,
        message: null,
        voidReason: null,
        signedS3Key: null,
      },
    })
    if (claimed.count === 0) return
    const recipients = await tx.recipient.findMany({
      where: { envelopeId: e.id },
      select: { id: true },
    })
    for (const r of recipients) {
      await tx.recipient.update({
        where: { id: r.id },
        data: {
          name: REDACTED.recipientName,
          email: REDACTED.recipientEmail(r.id),
          phone: null,
          signedIp: null,
          signedUserAgent: null,
          declineReason: null,
          tokenHash: null,
          tokenExpiresAt: null,
        },
      })
    }
    await tx.recipientOtp.deleteMany({ where: { recipient: { envelopeId: e.id } } })
    await tx.field.updateMany({
      where: { envelopeId: e.id },
      data: { value: null, imageS3Key: null, label: null },
    })
    // Notifications quote the title and recipients' names (docs/notifications.md).
    await tx.notification.deleteMany({ where: { envelopeId: e.id } })
    // Webhook payloads are snapshots with recipients' names and emails.
    await tx.webhookDelivery.updateMany({
      where: { payload: { path: ["envelope", "id"], equals: e.id } },
      data: { payload: { redacted: true, envelopeId: e.id } },
    })
    await appendAuditEvent(tx, {
      envelopeId: e.id,
      type: "envelope.purged",
      data: { reason },
    })
  })

  // 3. The original, once nothing still needs it (another live envelope or a template).
  const [liveEnvelopes, templates] = await Promise.all([
    prisma.envelope.count({ where: { documentId: e.documentId, purgedAt: null } }),
    prisma.template.count({ where: { documentId: e.documentId } }),
  ])
  if (liveEnvelopes === 0 && templates === 0) {
    const doc = await prisma.document.findUnique({
      where: { id: e.documentId },
      select: { s3Key: true, deletedAt: true },
    })
    if (doc) {
      await deleteObject(doc.s3Key).catch(() => {})
      await prisma.document.update({
        where: { id: e.documentId },
        data: { name: REDACTED.documentName, deletedAt: doc.deletedAt ?? now },
      })
    }
  }
  return { purged: true }
}

// ── Daily retention sweep ────────────────────────────────────────────────────
export async function retentionSweep(now: Date = new Date()) {
  const settings = await prisma.workspaceSettings.findMany({
    where: { retentionYears: { not: null } },
    select: { organizationId: true, retentionYears: true },
  })
  let queued = 0
  for (const s of settings) {
    const cutoff = retentionCutoff(s.retentionYears as RetentionYears, now)
    if (!cutoff) continue
    const due = await prisma.envelope.findMany({
      where: {
        organizationId: s.organizationId,
        purgedAt: null,
        status: { in: [...CLOSED_STATUSES] },
        OR: [
          { completedAt: { lt: cutoff } },
          { voidedAt: { lt: cutoff } },
          { status: { in: ["DECLINED", "EXPIRED"] }, updatedAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
      take: 1000,
    })
    const { maintenance } = getQueues()
    await Promise.all(
      due.map((d) =>
        maintenance.add(
          "envelope.purge",
          { envelopeId: d.id, reason: "retention" },
          { jobId: `purge-${d.id}` },
        ),
      ),
    )
    queued += due.length
  }
  return { queued }
}

// ── Export ───────────────────────────────────────────────────────────────────
const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)

/**
 * Builds the workspace ZIP, streamed to a temp file and then to storage, so memory holds one
 * file at a time: README, manifest.json, and per envelope envelope.json, audit.json and its PDFs.
 */
export async function buildExport(exportId: string) {
  const job = await prisma.dataExport.findUnique({ where: { id: exportId } })
  if (job?.status !== "PENDING") return { skipped: true }
  const dir = await mkdtemp(join(tmpdir(), "sahihi-export-"))
  const path = join(dir, "export.zip")
  try {
    const envelopes = await prisma.envelope.findMany({
      where: { organizationId: job.organizationId, purgedAt: null, status: { not: "DRAFT" } },
      orderBy: { createdAt: "asc" },
      take: EXPORT_MAX_ENVELOPES,
      include: {
        document: { select: { name: true, sha256: true, s3Key: true, deletedAt: true } },
        recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        certificate: true,
        auditEvents: { orderBy: { seq: "asc" } },
      },
    })

    const writer = Bun.file(path).writer()
    let failed: unknown = null
    const done = new Promise<void>((resolve, reject) => {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          failed = err
          return reject(err)
        }
        writer.write(chunk)
        if (final) resolve()
      })
      const add = (name: string, bytes: Uint8Array) => {
        // PDFs are already compressed: store them (no deflate) to save CPU.
        const file = new ZipPassThrough(name)
        zip.add(file)
        file.push(bytes, true)
      }
      ;(async () => {
        add(
          "README.txt",
          new TextEncoder().encode(
            "Sahihi workspace export.\n\nEach folder is one envelope: envelope.json (details and recipients), " +
              "audit.json (the hash-chained audit trail and its verification), original.pdf, and for completed " +
              "envelopes signed.pdf and certificate.pdf. manifest.json lists every envelope.\n",
          ),
        )
        const manifest = []
        for (const e of envelopes) {
          const folder = exportFolderName(e.title, e.id)
          const verification = await verifyAuditChain(e.auditEvents.map(toChainedEvent))
          add(
            `${folder}/envelope.json`,
            json({
              id: e.id,
              title: e.title,
              status: e.status,
              signingOrder: e.signingOrder,
              message: e.message,
              createdAt: e.createdAt,
              sentAt: e.sentAt,
              completedAt: e.completedAt,
              voidedAt: e.voidedAt,
              voidReason: e.voidReason,
              document: { name: e.document.name, sha256: e.document.sha256 },
              signedSha256: e.signedSha256,
              certificate: e.certificate
                ? {
                    code: e.certificate.code,
                    sha256: e.certificate.sha256,
                    issuedAt: e.certificate.issuedAt,
                  }
                : null,
              recipients: e.recipients.map((r) => ({
                name: r.name,
                email: r.email,
                phone: r.phone,
                role: r.role,
                order: r.order,
                status: r.status,
                verification: r.verification,
                viewedAt: r.viewedAt,
                signedAt: r.signedAt,
                declinedAt: r.declinedAt,
                declineReason: r.declineReason,
              })),
            }),
          )
          add(
            `${folder}/audit.json`,
            json({ verification, events: e.auditEvents.map(toChainedEvent) }),
          )
          if (!e.document.deletedAt) {
            add(`${folder}/original.pdf`, await getObjectBytes(e.document.s3Key))
          }
          if (e.signedS3Key) add(`${folder}/signed.pdf`, await getObjectBytes(e.signedS3Key))
          if (e.certificate) {
            add(`${folder}/certificate.pdf`, await getObjectBytes(e.certificate.s3Key))
          }
          manifest.push({ folder, id: e.id, title: e.title, status: e.status })
        }
        add("manifest.json", json({ exportedAt: new Date(), envelopes: manifest }))
        zip.end()
      })().catch((err) => {
        failed = err
        reject(err)
      })
    })
    await done
    await writer.end()
    if (failed) throw failed

    const key = keys.export(job.organizationId, job.id)
    const { size } = await stat(path)
    await putObjectStream(key, createReadStream(path), size, "application/zip")
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.dataExport.update({
        where: { id: job.id },
        data: {
          status: "READY",
          s3Key: key,
          sizeBytes: size,
          envelopeCount: envelopes.length,
          completedAt: now,
          expiresAt: new Date(now.getTime() + EXPORT_TTL_DAYS * 24 * 3600 * 1000),
        },
      })
      await notifyUsers(tx, {
        organizationId: job.organizationId,
        userIds: [job.requestedById],
        type: "export.ready",
        data: { envelopeCount: envelopes.length },
      })
    })
    return { envelopes: envelopes.length, sizeBytes: size }
  } catch (err) {
    await prisma.$transaction(async (tx) => {
      await tx.dataExport.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message.slice(0, 500) : "Export failed",
        },
      })
      await notifyUsers(tx, {
        organizationId: job.organizationId,
        userIds: [job.requestedById],
        type: "export.failed",
      })
    })
    throw err
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Daily: delete export archives past their expiry (the row stays as history). */
export async function cleanupExports(now: Date = new Date()) {
  const expired = await prisma.dataExport.findMany({
    where: { status: "READY", s3Key: { not: null }, expiresAt: { lt: now } },
    select: { id: true, s3Key: true },
  })
  for (const x of expired) {
    await deleteObject(x.s3Key as string).catch(() => {})
    await prisma.dataExport.update({ where: { id: x.id }, data: { s3Key: null } })
  }
  return { deleted: expired.length }
}

/** After a workspace is deleted (DB rows cascade): remove its stored files. */
export async function purgeOrganizationStorage(organizationId: string) {
  return { deleted: await deletePrefix(keys.orgPrefix(organizationId)) }
}

// ── Notifications ────────────────────────────────────────────────────────────

/** Daily: delete in-app notifications older than NOTIFICATION_TTL_DAYS, read or not. */
export async function cleanupNotifications(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - NOTIFICATION_TTL_DAYS * 24 * 3600 * 1000)
  const { count } = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return { deleted: count }
}
