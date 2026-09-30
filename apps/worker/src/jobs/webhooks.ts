import { lookup } from "node:dns/promises"
import { getEnv } from "@sahihi/config"
import {
  checkWebhookUrl,
  decryptSecret,
  isPrivateAddress,
  signWebhook,
  trimResponseBody,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMEOUT_MS,
  webhookBody,
} from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { enqueueWebhookDeliveries } from "@sahihi/infra"
import { UnrecoverableError } from "bullmq"

/**
 * Delivers one webhook event to one endpoint (docs/webhooks.md). Each attempt is recorded on the
 * delivery. Throwing lets BullMQ retry (backoff: webhookRetryDelayMs); UnrecoverableError stops.
 */
export async function deliverWebhook(deliveryId: string, attempt: { isFinal: boolean }) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  })
  // Endpoint deleted (cascade) or already delivered: nothing to do.
  if (!delivery || delivery.status === "SUCCEEDED") return { skipped: true }

  const fail = async (message: string, statusCode: number | null, response: string | null) => {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        lastStatusCode: statusCode,
        lastError: message,
        lastResponse: response,
        ...(attempt.isFinal && { status: "FAILED" }),
      },
    })
  }
  const giveUp = async (message: string) => {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: message,
        status: "FAILED",
      },
    })
    throw new UnrecoverableError(message)
  }

  const { endpoint } = delivery
  if (!endpoint.enabled && delivery.type !== "webhook.test") await giveUp("Endpoint is disabled")

  // SSRF: re-check the stored URL and what its host resolves to right now.
  const env = getEnv()
  const allowPrivate = env.WEBHOOKS_ALLOW_PRIVATE_URLS
  const checked = checkWebhookUrl(endpoint.url, { allowPrivate })
  if (!checked.ok) return giveUp(checked.message)
  if (!allowPrivate) {
    const addresses = await lookup(checked.url.hostname, { all: true }).catch(() => [])
    if (addresses.length === 0) {
      await fail(`Could not resolve ${checked.url.hostname}`, null, null)
      throw new Error("DNS lookup failed")
    }
    if (addresses.some((a) => isPrivateAddress(a.address))) {
      await giveUp("The endpoint resolves to a private address")
    }
  }

  const body = webhookBody({
    id: delivery.eventId,
    type: delivery.type,
    createdAt: delivery.createdAt,
    organizationId: delivery.organizationId,
    data: delivery.payload,
  })
  const secret = await decryptSecret(env.BETTER_AUTH_SECRET, endpoint.secretEncrypted)
  const signature = await signWebhook(secret, Math.floor(Date.now() / 1000), body)

  let res: Response
  try {
    res = await fetch(checked.url, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "user-agent": "Sahihi-Webhooks/1.0",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
        "Sahihi-Event-Id": delivery.eventId,
        "Sahihi-Event-Type": delivery.type,
      },
      // A redirect could point anywhere (including internal hosts): treat it as a failure.
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `No response within ${WEBHOOK_TIMEOUT_MS / 1000}s`
        : `Request failed: ${err instanceof Error ? err.message : String(err)}`
    await fail(message, null, null)
    throw new Error(message)
  }

  const text = trimResponseBody(await res.text().catch(() => ""))
  if (res.status >= 200 && res.status < 300) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SUCCEEDED",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        deliveredAt: new Date(),
        lastStatusCode: res.status,
        lastError: null,
        lastResponse: text,
      },
    })
    return { status: res.status }
  }
  const message =
    res.status >= 300 && res.status < 400
      ? `Redirect (${res.status}) not followed; use the final URL`
      : `HTTP ${res.status}`
  await fail(message, res.status, text)
  throw new Error(message)
}

/**
 * Outbox sweep: deliveries committed but never enqueued (e.g. the process died between commit and
 * enqueue). Job ids are the delivery ids, so re-enqueueing one that's already queued is a no-op.
 */
export async function sweepWebhookOutbox(olderThanMs = 2 * 60_000) {
  const stuck = await prisma.webhookDelivery.findMany({
    where: {
      status: "PENDING",
      attempts: 0,
      createdAt: { lt: new Date(Date.now() - olderThanMs) },
    },
    select: { id: true },
    take: 1000,
  })
  await enqueueWebhookDeliveries(stuck.map((d) => d.id))
  return { enqueued: stuck.length }
}
