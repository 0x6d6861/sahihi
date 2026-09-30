import { envelopeEventData, type WebhookEventType } from "@sahihi/core"
import type { Prisma } from "./generated/prisma/client"

/**
 * Webhook outbox (docs/webhooks.md). Call inside the SAME transaction as the state change, so an
 * event exists if and only if the change committed. After the transaction resolves, enqueue the
 * returned ids with `enqueueWebhookDeliveries` (@sahihi/infra). A maintenance sweep re-enqueues
 * any delivery that was committed but never picked up.
 *
 * The payload is a snapshot taken now (inside the transaction), so it reflects the new state.
 */
export async function queueEnvelopeWebhook(
  tx: Prisma.TransactionClient,
  input: {
    envelopeId: string
    type: WebhookEventType
    /** Extra top-level data, e.g. `{ recipientId }` for recipient.signed */
    extra?: Record<string, unknown>
  },
): Promise<string[]> {
  const envelope = await tx.envelope.findUniqueOrThrow({
    where: { id: input.envelopeId },
    select: { organizationId: true },
  })
  const endpoints = await tx.webhookEndpoint.findMany({
    where: { organizationId: envelope.organizationId, enabled: true, events: { has: input.type } },
    select: { id: true },
  })
  if (endpoints.length === 0) return []

  const snapshot = await tx.envelope.findUniqueOrThrow({
    where: { id: input.envelopeId },
    include: {
      document: { select: { id: true, name: true, sha256: true } },
      certificate: { select: { code: true } },
      recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  })
  const payload = envelopeEventData(snapshot, input.extra) as Prisma.InputJsonValue
  const eventId = `evt_${crypto.randomUUID().replace(/-/g, "")}`
  const created = await Promise.all(
    endpoints.map((ep) =>
      tx.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          organizationId: envelope.organizationId,
          eventId,
          type: input.type,
          payload,
        },
        select: { id: true },
      }),
    ),
  )
  return created.map((d) => d.id)
}
