import { getEnv } from "@sahihi/config"
import {
  generateCertificateCode,
  type NormalizedRect,
  readConsentEvidence,
  sha256Hex,
} from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { getObjectBytes, getQueues, keys, putObject } from "@sahihi/infra"
import { renderCertificate, type StampField, stampFields } from "@sahihi/pdf"
import { getSigningProvider } from "../providers"

/**
 * envelope.finalize — runs once an envelope is COMPLETED.
 *   1. verify original hash  2. stamp values  3. provider seal  4. store signed.pdf
 *   5. render + store certificate.pdf  6. notify everyone
 * Idempotent: safe to retry at any step. See docs/pdf-pipeline.md.
 */
export async function finalizeEnvelope(envelopeId: string) {
  const e = await prisma.envelope.findUniqueOrThrow({
    where: { id: envelopeId },
    include: {
      document: true,
      organization: { select: { name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      fields: true,
      certificate: { select: { id: true } },
    },
  })
  if (e.status !== "COMPLETED")
    throw new Error(`Envelope ${envelopeId} is ${e.status}, not COMPLETED`)
  if (e.certificate) return { skipped: true }

  // ── 1–4: signed PDF ──
  let signedSha256 = e.signedSha256
  if (!e.signedS3Key || !signedSha256) {
    const original = await getObjectBytes(e.document.s3Key)
    if ((await sha256Hex(original)) !== e.document.sha256) {
      throw new Error(`Original document hash mismatch for envelope ${envelopeId}`)
    }

    const toStamp: StampField[] = []
    for (const f of e.fields) {
      if (!f.filledAt) continue
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
      documentName: e.document.name,
      originalSha256: e.document.sha256 ?? "",
      completedAt: (e.completedAt ?? new Date()).toISOString(),
      signers: e.recipients.map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: r.role,
        verification: r.verification,
        ipAddress: r.signedIp,
        userAgent: r.signedUserAgent,
        viewedAt: r.viewedAt?.toISOString() ?? null,
        signedAt: r.signedAt?.toISOString() ?? null,
      })),
    })

    signedSha256 = await sha256Hex(sealed.pdf)
    const signedKey = keys.signed(e.organizationId, envelopeId)
    await putObject(signedKey, sealed.pdf, "application/pdf")
    await prisma.$transaction(async (tx) => {
      await tx.envelope.update({
        where: { id: envelopeId },
        data: { signedS3Key: signedKey, signedSha256 },
      })
      await appendAuditEvent(tx, {
        envelopeId,
        type: "document.finalized",
        data: { signedSha256, provider: sealed.provider, providerRef: sealed.providerRef },
      })
    })
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
      documentName: e.document.name,
      pageCount: e.document.pageCount ?? 0,
      sender: { name: e.createdBy.name, email: e.createdBy.email },
      createdAt: e.createdAt,
      sentAt: e.sentAt,
      completedAt: e.completedAt ?? new Date(),
      originalSha256: e.document.sha256 ?? "",
      signedSha256,
    },
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
  await prisma.$transaction(async (tx) => {
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
  })

  // ── 6: notify ──
  await getQueues().notifications.add("envelope.completed", { envelopeId })
  return { code }
}
