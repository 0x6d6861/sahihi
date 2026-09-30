import { assertTransition, sendPreflight } from "@sahihi/core"
import { appendAuditEvent, prisma, queueEnvelopeWebhook } from "@sahihi/db"
import { enqueueWebhookDeliveries, getQueues } from "@sahihi/infra"
import { EnvelopeError, notFound } from "./errors"
import { assertEnvelopeQuota } from "./quota"
import { activateNextRecipients } from "./routing"

/** Who did it, for the audit trail (an API key acts on behalf of the admin who created it). */
export interface Actor {
  userId: string
  apiKeyId?: string
  ipAddress?: string | null
  userAgent?: string | null
}

export const actorData = (a: Actor) => (a.apiKeyId ? { via: "api", apiKeyId: a.apiKeyId } : {})

/**
 * DRAFT → SENT (docs/signing-flow.md → Sending): preflight, plan quota, transition, audit,
 * invite the first recipients, webhooks. Enqueues after commit. Throws EnvelopeError /
 * InvalidTransitionError.
 */
export async function sendEnvelope(input: {
  envelopeId: string
  organizationId: string
  actor: Actor
}): Promise<{ notified: number }> {
  const envelope = await prisma.envelope.findFirst({
    where: { id: input.envelopeId, organizationId: input.organizationId },
    include: { recipients: true, fields: { select: { recipientId: true, type: true } } },
  })
  if (!envelope) notFound("Envelope")
  const e = envelope as NonNullable<typeof envelope>
  assertTransition(e.status, "SENT")

  const issues = sendPreflight(e)
  if (issues.length > 0) {
    throw new EnvelopeError(400, "preflight_failed", issues[0]?.message ?? "Not ready to send", {
      issues,
    })
  }

  const { links, webhooks } = await prisma.$transaction(async (tx) => {
    // Plan limit (docs/billing.md): serialised per workspace, refused with 402.
    await assertEnvelopeQuota(tx, e.organizationId)
    await tx.envelope.update({ where: { id: e.id }, data: { status: "SENT", sentAt: new Date() } })
    await appendAuditEvent(tx, {
      envelopeId: e.id,
      type: "envelope.sent",
      actorUserId: input.actor.userId,
      data: {
        recipients: e.recipients.length,
        signingOrder: e.signingOrder,
        ...actorData(input.actor),
      },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    })
    const links = await activateNextRecipients(tx, e.id)
    const webhooks = await queueEnvelopeWebhook(tx, { envelopeId: e.id, type: "envelope.sent" })
    return { links, webhooks }
  })

  const q = getQueues().notifications
  await Promise.all(links.map((l) => q.add("envelope.invite", l)))
  await enqueueWebhookDeliveries(webhooks)
  return { notified: links.length }
}
