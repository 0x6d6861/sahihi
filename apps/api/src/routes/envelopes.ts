import {
  assertTransition,
  CreateEnvelopeSchema,
  downloadFileName,
  isEditable,
  ReplaceFieldsSchema,
  ReplaceRecipientsSchema,
  reminderAvailability,
  sendPreflight,
  VoidEnvelopeSchema,
  verifyAuditChain,
} from "@sahihi/core"
import { appendAuditEvent, forOrganization, prisma, toChainedEvent } from "@sahihi/db"
import { getQueues, presignDownload } from "@sahihi/infra"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { badRequest, clientMeta, conflict, notFound, parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"
import { activateNextRecipients, rotateRecipientLink } from "../services/routing"

/** Never leak token hashes to clients. */
const recipientSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  order: true,
  status: true,
  verification: true,
  colorIndex: true,
  notifiedAt: true,
  lastRemindedAt: true,
  reminderCount: true,
  viewedAt: true,
  signedAt: true,
  declinedAt: true,
  declineReason: true,
} as const

export const envelopes = new Hono<AppEnv>()
  .use(requireOrg)

  .post("/", async (c) => {
    const input = await parseJson(c, CreateEnvelopeSchema)
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const doc = await prisma.document.findFirst({
      where: scope.document({ id: input.documentId, status: "READY" }),
    })
    if (!doc) notFound("Document")

    const envelope = await prisma.$transaction(async (tx) => {
      const created = await tx.envelope.create({
        data: {
          organizationId: orgId,
          documentId: doc.id,
          createdById: c.get("user").id,
          title: input.title,
          message: input.message,
          signingOrder: input.signingOrder,
          expiresAt: input.expiresAt,
        },
      })
      await appendAuditEvent(tx, {
        envelopeId: created.id,
        type: "envelope.created",
        actorUserId: c.get("user").id,
        data: { documentId: doc.id, documentSha256: doc.sha256 },
        ...clientMeta(c),
      })
      return created
    })
    return c.json({ envelope }, 201)
  })

  .get("/", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const status = c.req.query("status")
    const items = await prisma.envelope.findMany({
      where: scope.envelope(status ? { status: status as never } : {}),
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        document: { select: { id: true, name: true, pageCount: true } },
        recipients: { select: { id: true, name: true, status: true, role: true } },
      },
    })
    return c.json({ items })
  })

  .get("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: {
        document: { select: { id: true, name: true, pageCount: true, pages: true, sha256: true } },
        recipients: { select: recipientSelect, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        fields: { orderBy: [{ page: "asc" }, { y: "asc" }] },
        certificate: { select: { code: true, issuedAt: true, provider: true } },
      },
    })
    if (!envelope) notFound("Envelope")
    return c.json({ envelope })
  })

  /** Replace the recipient list (draft only). Removed recipients lose their fields. */
  .put("/:id/recipients", async (c) => {
    const { recipients } = await parseJson(c, ReplaceRecipientsSchema)
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: { recipients: { select: { id: true } } },
    })
    if (!envelope) notFound("Envelope")
    if (!isEditable(envelope.status)) conflict("Only draft envelopes can be edited")

    const emails = recipients.map((r) => r.email)
    if (new Set(emails).size !== emails.length) badRequest("Duplicate recipient emails")
    const existingIds = new Set(envelope.recipients.map((r) => r.id))

    const saved = await prisma.$transaction(async (tx) => {
      const keep = recipients
        .filter((r) => r.id && existingIds.has(r.id))
        .map((r) => r.id as string)
      await tx.recipient.deleteMany({ where: { envelopeId: envelope.id, id: { notIn: keep } } })
      for (const [i, r] of recipients.entries()) {
        const data = {
          name: r.name,
          email: r.email,
          phone: r.phone ?? null,
          role: r.role,
          order: envelope.signingOrder === "SEQUENTIAL" ? r.order : 1,
          verification: r.verification,
          colorIndex: i,
        }
        if (r.id && existingIds.has(r.id)) await tx.recipient.update({ where: { id: r.id }, data })
        else await tx.recipient.create({ data: { ...data, envelopeId: envelope.id } })
      }
      // Viewers never own fields
      await tx.field.deleteMany({
        where: { envelopeId: envelope.id, recipient: { role: "VIEWER" } },
      })
      return tx.recipient.findMany({ where: { envelopeId: envelope.id }, select: recipientSelect })
    })
    return c.json({ recipients: saved })
  })

  /** Replace all fields (editor autosave). Draft only. */
  .put("/:id/fields", async (c) => {
    const { fields } = await parseJson(c, ReplaceFieldsSchema)
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: {
        recipients: { select: { id: true, role: true } },
        document: { select: { pageCount: true } },
      },
    })
    if (!envelope) notFound("Envelope")
    if (!isEditable(envelope.status)) conflict("Only draft envelopes can be edited")

    const owners = new Map(envelope.recipients.map((r) => [r.id, r.role]))
    for (const f of fields) {
      const role = owners.get(f.recipientId)
      if (!role) badRequest(`Unknown recipient ${f.recipientId}`)
      if (role === "VIEWER") badRequest("Viewers cannot own fields")
      if (f.page > (envelope.document.pageCount ?? 0)) badRequest(`Page ${f.page} does not exist`)
    }

    const saved = await prisma.$transaction(async (tx) => {
      await tx.field.deleteMany({ where: { envelopeId: envelope.id } })
      await tx.field.createMany({
        data: fields.map(({ id: _id, ...f }) => ({ ...f, envelopeId: envelope.id })),
      })
      return tx.field.findMany({ where: { envelopeId: envelope.id } })
    })
    return c.json({ fields: saved })
  })

  /** Everything that would stop `send` right now (all issues, not just the first). */
  .get("/:id/preflight", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: { recipients: true, fields: { select: { recipientId: true, type: true } } },
    })
    if (!envelope) notFound("Envelope")
    return c.json({ status: envelope.status, issues: sendPreflight(envelope) })
  })

  .post("/:id/send", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: { recipients: true, fields: { select: { recipientId: true, type: true } } },
    })
    if (!envelope) notFound("Envelope")
    assertTransition(envelope.status, "SENT")

    // ── Pre-flight validation (docs/signing-flow.md → Sending) ──
    const issues = sendPreflight(envelope)
    if (issues.length > 0) {
      return c.json({ error: "preflight_failed", message: issues[0]?.message, issues }, 400)
    }

    const links = await prisma.$transaction(async (tx) => {
      await tx.envelope.update({
        where: { id: envelope.id },
        data: { status: "SENT", sentAt: new Date() },
      })
      await appendAuditEvent(tx, {
        envelopeId: envelope.id,
        type: "envelope.sent",
        actorUserId: c.get("user").id,
        data: { recipients: envelope.recipients.length, signingOrder: envelope.signingOrder },
        ...clientMeta(c),
      })
      return activateNextRecipients(tx, envelope.id)
    })

    const q = getQueues().notifications
    await Promise.all(links.map((l) => q.add("envelope.invite", l)))
    return c.json({ ok: true, notified: links.length })
  })

  .post("/:id/void", async (c) => {
    const { reason } = await parseJson(c, VoidEnvelopeSchema)
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
    })
    if (!envelope) notFound("Envelope")
    assertTransition(envelope.status, "VOIDED")

    await prisma.$transaction(async (tx) => {
      await tx.envelope.update({
        where: { id: envelope.id },
        data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason },
      })
      // Kill all outstanding links
      await tx.recipient.updateMany({
        where: { envelopeId: envelope.id },
        data: { tokenHash: null },
      })
      await appendAuditEvent(tx, {
        envelopeId: envelope.id,
        type: "envelope.voided",
        actorUserId: c.get("user").id,
        data: { reason },
        ...clientMeta(c),
      })
    })
    await getQueues().notifications.add("envelope.voided", { envelopeId: envelope.id })
    return c.json({ ok: true })
  })

  .post("/:id/recipients/:recipientId/remind", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const recipient = await prisma.recipient.findFirst({
      where: {
        id: c.req.param("recipientId"),
        envelope: scope.envelope({ id: c.req.param("id") }),
      },
      include: { envelope: { select: { status: true } } },
    })
    if (!recipient) notFound("Recipient")
    // Same rules the UI uses to enable "Send reminder" (throttled: it emails and rotates the link).
    const availability = reminderAvailability(recipient, recipient.envelope.status)
    if (!availability.ok) {
      if (availability.reason === "cooldown") {
        c.header("Retry-After", String(availability.waitSec))
        return c.json(
          {
            error: "reminder_cooldown",
            message: "A reminder was sent recently",
            retryAfterSec: availability.waitSec,
          },
          429,
        )
      }
      return c.json(
        { error: availability.reason, message: "This recipient can't be reminded" },
        409,
      )
    }

    const link = await prisma.$transaction(async (tx) => {
      const l = await rotateRecipientLink(tx, recipient.id)
      await appendAuditEvent(tx, {
        envelopeId: recipient.envelopeId,
        type: "recipient.reminded",
        recipientId: recipient.id,
        actorUserId: c.get("user").id,
        ...clientMeta(c),
      })
      return l
    })
    await getQueues().notifications.add("envelope.reminder", link)
    return c.json({ ok: true })
  })

  .get("/:id/audit", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: { auditEvents: { orderBy: { seq: "asc" } } },
    })
    if (!envelope) notFound("Envelope")
    const verification = await verifyAuditChain(envelope.auditEvents.map(toChainedEvent))
    return c.json({ events: envelope.auditEvents, verification })
  })

  .get("/:id/downloads", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const envelope = await prisma.envelope.findFirst({
      where: scope.envelope({ id: c.req.param("id") }),
      include: { certificate: true },
    })
    if (!envelope) notFound("Envelope")
    if (!envelope.signedS3Key || !envelope.certificate) conflict("Envelope is not finalized yet")
    return c.json({
      signed: await presignDownload(envelope.signedS3Key, {
        fileName: downloadFileName(envelope.title, "signed"),
        disposition: "attachment",
      }),
      certificate: await presignDownload(envelope.certificate.s3Key, {
        fileName: downloadFileName(envelope.title, "certificate"),
        disposition: "attachment",
      }),
    })
  })
