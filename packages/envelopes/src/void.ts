import { assertTransition } from "@sahihi/core"
import { appendAuditEvent, prisma, queueEnvelopeWebhook } from "@sahihi/db"
import { enqueueWebhookDeliveries, getQueues } from "@sahihi/infra"
import { notFound } from "./errors"
import { type Actor, actorData } from "./send"

/** SENT/IN_PROGRESS → VOIDED: kill every link, audit, notify recipients, webhooks. */
export async function voidEnvelope(input: {
  envelopeId: string
  organizationId: string
  reason: string
  actor: Actor
}) {
  const envelope = await prisma.envelope.findFirst({
    where: { id: input.envelopeId, organizationId: input.organizationId },
    select: { id: true, status: true },
  })
  if (!envelope) notFound("Envelope")
  const e = envelope as NonNullable<typeof envelope>
  assertTransition(e.status, "VOIDED")

  const webhooks = await prisma.$transaction(async (tx) => {
    await tx.envelope.update({
      where: { id: e.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidReason: input.reason },
    })
    // Kill all outstanding links
    await tx.recipient.updateMany({ where: { envelopeId: e.id }, data: { tokenHash: null } })
    await appendAuditEvent(tx, {
      envelopeId: e.id,
      type: "envelope.voided",
      actorUserId: input.actor.userId,
      data: { reason: input.reason, ...actorData(input.actor) },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    })
    return queueEnvelopeWebhook(tx, { envelopeId: e.id, type: "envelope.voided" })
  })
  await getQueues().notifications.add("envelope.voided", { envelopeId: e.id })
  await enqueueWebhookDeliveries(webhooks)
}
