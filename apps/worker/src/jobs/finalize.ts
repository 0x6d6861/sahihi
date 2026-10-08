import { createReadStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getEnv } from "@sahihi/config"
import {
  downloadFileName,
  generateCertificateCode,
  type NormalizedRect,
  numberedFileName,
  readConsentEvidence,
  sha256Hex,
  signedDocumentFileName,
} from "@sahihi/core"
import { appendAuditEvent, notifyEnvelopeOwner, prisma, queueEnvelopeWebhook } from "@sahihi/db"
import {
  createLogger,
  enqueueWebhookDeliveries,
  getObjectBytes,
  getQueues,
  keys,
  putObject,
  putObjectStream,
} from "@sahihi/infra"
import { renderCertificate, type StampField, stampFields } from "@sahihi/pdf"
import { Zip, ZipPassThrough } from "fflate"
import { getSigningProvider } from "../providers"

const log = createLogger("worker")

/**
 * envelope.finalize — runs once an envelope is COMPLETED.
 *   1–4. per document (ADR 0037): verify the original's hash, stamp its fields, provider seal,
 *        store signed/<envelopeDocumentId>.pdf
 *   5. render + store certificate.pdf (every document and supporting file with its hash)
 *   6. build bundle.zip ("Download all")  7. notify everyone
 * Idempotent: safe to retry at any step. See docs/pdf-pipeline.md.
 */
export async function finalizeEnvelope(envelopeId: string) {
  const e = await prisma.envelope.findUniqueOrThrow({
    where: { id: envelopeId },
    include: {
      documents: { orderBy: { order: "asc" }, include: { document: true } },
      attachments: { where: { status: "READY" }, orderBy: { order: "asc" } },
      organization: { select: { name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      fields: true,
      certificate: { select: { id: true } },
    },
  })
  if (e.status !== "COMPLETED")
    throw new Error(`Envelope ${envelopeId} is ${e.status}, not COMPLETED`)
  if (e.certificate) {
    // A retry after the certificate: only the convenience bundle may still be missing.
    if (!e.bundleS3Key) await buildBundle(envelopeId)
    return { skipped: true }
  }

  const signers = e.recipients.map((r) => ({
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    verification: r.verification,
    ipAddress: r.signedIp,
    userAgent: r.signedUserAgent,
    viewedAt: r.viewedAt?.toISOString() ?? null,
    signedAt: r.signedAt?.toISOString() ?? null,
  }))

  // ── 1–4: one signed PDF per document (ADR 0037). Documents already done are skipped, so a
  // retry resumes where it stopped. ──
  const signed = new Map<string, string>()
  for (const ed of e.documents) {
    if (ed.signedS3Key && ed.signedSha256) {
      signed.set(ed.id, ed.signedSha256)
      continue
    }
    const original = await getObjectBytes(ed.document.s3Key)
    if ((await sha256Hex(original)) !== ed.document.sha256) {
      throw new Error(`Original document hash mismatch for envelope ${envelopeId} (${ed.id})`)
    }

    const toStamp: StampField[] = []
    for (const f of e.fields) {
      if (f.envelopeDocumentId !== ed.id || !f.filledAt) continue
      const rect: NormalizedRect = { x: f.x, y: f.y, width: f.width, height: f.height }
      if (f.imageS3Key) {
        toStamp.push({
          page: f.page,
          rect,
          type: f.type,
          value: { kind: "image", png: await getObjectBytes(f.imageS3Key) },
        })
      } else if (f.type === "CHECKBOX") {
        toStamp.push({
          page: f.page,
          rect,
          type: f.type,
          value: { kind: "checkbox", checked: f.value === "true" },
        })
      } else if (f.value) {
        toStamp.push({ page: f.page, rect, type: f.type, value: { kind: "text", text: f.value } })
      }
    }

    const stamped = await stampFields(original, toStamp, { title: e.title, envelopeId })
    const sealed = await getSigningProvider().seal(stamped, {
      envelopeId,
      title: e.title,
      organizationName: e.organization.name,
      documentName: ed.document.name,
      originalSha256: ed.document.sha256 ?? "",
      completedAt: (e.completedAt ?? new Date()).toISOString(),
      signers,
    })

    const signedSha256 = await sha256Hex(sealed.pdf)
    const signedKey = keys.signedDocument(e.organizationId, envelopeId, ed.id)
    await putObject(signedKey, sealed.pdf, "application/pdf")
    await prisma.$transaction(async (tx) => {
      await tx.envelopeDocument.update({
        where: { id: ed.id },
        data: { signedS3Key: signedKey, signedSha256 },
      })
      await appendAuditEvent(tx, {
        envelopeId,
        type: "document.finalized",
        data: {
          envelopeDocumentId: ed.id,
          documentName: ed.document.name,
          signedSha256,
          provider: sealed.provider,
          providerRef: sealed.providerRef,
        },
      })
    })
    signed.set(ed.id, signedSha256)
  }

  // ── 5: certificate ──
  const events = await prisma.auditEvent.findMany({
    where: { envelopeId },
    orderBy: { seq: "asc" },
  })
  const names = new Map<string, string>([[e.createdBy.id, e.createdBy.name]])
  for (const r of e.recipients) names.set(r.id, r.name)
  const actor = (ev: (typeof events)[number]) =>
    (ev.recipientId && names.get(ev.recipientId)) ||
    (ev.actorUserId && names.get(ev.actorUserId)) ||
    "System"

  // What each signer agreed to, from their consent event (the audit trail is the source of truth).
  const consentOf = (recipientId: string) => {
    const ev = events.findLast(
      (x) => x.type === "recipient.consented" && x.recipientId === recipientId,
    )
    const evidence = readConsentEvidence(ev?.data)
    return evidence
      ? { version: evidence.consentVersion, textSha256: evidence.consentTextSha256 }
      : null
  }

  const code = generateCertificateCode()
  const pdf = await renderCertificate({
    code,
    verifyUrl: `${getEnv().WEB_URL}/verify/${code}`,
    provider: getEnv().SIGNING_PROVIDER === "ca" ? "CA" : "INTERNAL",
    auditChainHead: events.at(-1)?.hash ?? "",
    envelope: {
      id: envelopeId,
      title: e.title,
      organizationName: e.organization.name,
      sender: { name: e.createdBy.name, email: e.createdBy.email },
      createdAt: e.createdAt,
      sentAt: e.sentAt,
      completedAt: e.completedAt ?? new Date(),
    },
    documents: e.documents.map((ed) => ({
      name: ed.document.name,
      pageCount: ed.document.pageCount ?? 0,
      originalSha256: ed.document.sha256 ?? "",
      signedSha256: signed.get(ed.id) ?? "",
    })),
    attachments: e.attachments.map((a) => ({
      name: a.name,
      sizeBytes: a.sizeBytes,
      sha256: a.sha256 ?? "",
    })),
    signers: e.recipients
      .filter((r) => r.role !== "VIEWER")
      .map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: r.role,
        verification: r.verification,
        ipAddress: r.signedIp,
        userAgent: r.signedUserAgent,
        viewedAt: r.viewedAt,
        signedAt: r.signedAt,
        consent: consentOf(r.id),
      })),
    events: events.map((ev) => ({
      occurredAt: ev.occurredAt,
      type: ev.type,
      actor: actor(ev),
      ipAddress: ev.ipAddress,
    })),
  })

  const certKey = keys.certificate(e.organizationId, envelopeId)
  const certSha = await sha256Hex(pdf)
  await putObject(certKey, pdf, "application/pdf")
  const webhooks = await prisma.$transaction(async (tx) => {
    await tx.certificate.create({
      data: {
        envelopeId,
        code,
        s3Key: certKey,
        sha256: certSha,
        provider: getEnv().SIGNING_PROVIDER === "ca" ? "CA" : "INTERNAL",
      },
    })
    await appendAuditEvent(tx, {
      envelopeId,
      type: "certificate.issued",
      data: { code, sha256: certSha },
    })
    await notifyEnvelopeOwner(tx, { envelopeId, type: "envelope.completed" })
    // Emitted here, not at the last signature, so receivers can fetch the signed PDF right away.
    return queueEnvelopeWebhook(tx, { envelopeId, type: "envelope.completed" })
  })

  // ── 6: "Download all" (a convenience; failures don't hold up the completion) ──
  await buildBundle(envelopeId).catch((err: unknown) =>
    log.warn("bundle not built", { envelopeId, err: err instanceof Error ? err.message : err }),
  )

  // ── 7: notify ──
  await getQueues().notifications.add("envelope.completed", { envelopeId })
  await enqueueWebhookDeliveries(webhooks)
  return { code }
}

/**
 * `bundle.zip`: the signed PDFs in signing order, the certificate and the supporting files
 * (ADR 0037). Streamed to a temp file, one object at a time, then uploaded. Not evidence: every
 * file inside has its own hash on the certificate.
 */
export async function buildBundle(envelopeId: string) {
  const e = await prisma.envelope.findUniqueOrThrow({
    where: { id: envelopeId },
    include: {
      documents: { orderBy: { order: "asc" }, include: { document: { select: { name: true } } } },
      attachments: { where: { status: "READY" }, orderBy: { order: "asc" } },
      certificate: { select: { s3Key: true } },
    },
  })
  if (!e.certificate || e.purgedAt || e.documents.some((d) => !d.signedS3Key)) return null
  const dir = await mkdtemp(join(tmpdir(), "sahihi-bundle-"))
  const path = join(dir, "bundle.zip")
  try {
    const writer = Bun.file(path).writer()
    let failed: unknown = null
    const zip = new Zip((err, chunk) => {
      if (err) failed = err
      else writer.write(chunk)
    })
    const add = async (name: string, key: string) => {
      // PDFs and Office files are already compressed: store them.
      const entry = new ZipPassThrough(name)
      zip.add(entry)
      entry.push(await getObjectBytes(key), true)
    }
    for (const [i, d] of e.documents.entries()) {
      await add(
        numberedFileName(i, signedDocumentFileName(d.document.name)),
        d.signedS3Key as string,
      )
    }
    await add(downloadFileName(e.title, "certificate"), e.certificate.s3Key)
    for (const [i, a] of e.attachments.entries()) {
      await add(`supporting-files/${numberedFileName(i, a.name)}`, a.s3Key)
    }
    zip.end()
    await writer.end()
    if (failed) throw failed
    const key = keys.bundle(e.organizationId, envelopeId)
    const { size } = await stat(path)
    await putObjectStream(key, createReadStream(path), size, "application/zip")
    await prisma.envelope.update({ where: { id: envelopeId }, data: { bundleS3Key: key } })
    return key
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
