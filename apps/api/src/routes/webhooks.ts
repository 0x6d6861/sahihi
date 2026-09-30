import { getEnv } from "@sahihi/config"
import {
  CreateWebhookSchema,
  checkWebhookUrl,
  encryptSecret,
  generateWebhookSecret,
  hasPermission,
  UpdateWebhookSchema,
  WEBHOOK_TEST_EVENT,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { enqueueWebhookDeliveries } from "@sahihi/infra"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../lib/env"
import { badRequest, conflict, forbidden, notFound, parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"

/**
 * Webhook endpoints (docs/webhooks.md). Owners and admins only (`webhook:manage`): they send the
 * org's envelope data to a URL of their choosing. The signing secret is returned in full only on
 * create and rotate; afterwards only its last 4 characters.
 */

export const MAX_WEBHOOK_ENDPOINTS = 10

const endpointSelect = {
  id: true,
  url: true,
  description: true,
  events: true,
  enabled: true,
  secretHint: true,
  createdAt: true,
  updatedAt: true,
} as const

const deliverySelect = {
  id: true,
  eventId: true,
  type: true,
  status: true,
  attempts: true,
  lastAttemptAt: true,
  lastStatusCode: true,
  lastError: true,
  lastResponse: true,
  deliveredAt: true,
  createdAt: true,
} as const

const requireWebhookManager = createMiddleware<AppEnv>(async (c, next) => {
  if (!hasPermission(c.get("memberRole"), { webhook: ["manage"] })) {
    forbidden("Only owners and admins can manage webhooks")
  }
  await next()
})

function validUrl(raw: string): string {
  const checked = checkWebhookUrl(raw, { allowPrivate: getEnv().WEBHOOKS_ALLOW_PRIVATE_URLS })
  if (!checked.ok) {
    throw Object.assign(new Error(checked.message), { issue: checked.message })
  }
  return checked.url.toString()
}

async function newSecret() {
  const secret = generateWebhookSecret()
  return {
    secret,
    secretEncrypted: await encryptSecret(getEnv().BETTER_AUTH_SECRET, secret),
    secretHint: secret.slice(-4),
  }
}

/** URL problems come back like schema issues, so the form shows them on the URL field. */
function urlIssue(message: string) {
  return Response.json(
    { error: "validation_error", issues: [{ path: "url", message }] },
    { status: 400 },
  )
}

export const webhooks = new Hono<AppEnv>()
  .use(requireOrg)
  .use(requireWebhookManager)

  .get("/", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const items = await prisma.webhookEndpoint.findMany({
      where: scope.webhookEndpoint(),
      orderBy: { createdAt: "asc" },
      select: {
        ...endpointSelect,
        deliveries: {
          select: deliverySelect,
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    })
    return c.json({ items })
  })

  .post("/", async (c) => {
    const input = await parseJson(c, CreateWebhookSchema)
    const orgId = c.get("organizationId")
    let url: string
    try {
      url = validUrl(input.url)
    } catch (err) {
      return urlIssue((err as Error).message)
    }
    const count = await prisma.webhookEndpoint.count({ where: { organizationId: orgId } })
    if (count >= MAX_WEBHOOK_ENDPOINTS) {
      conflict(`A workspace can have up to ${MAX_WEBHOOK_ENDPOINTS} webhook endpoints`)
    }
    const { secret, secretEncrypted, secretHint } = await newSecret()
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        organizationId: orgId,
        createdById: c.get("user").id,
        url,
        description: input.description || null,
        events: input.events,
        secretEncrypted,
        secretHint,
      },
      select: endpointSelect,
    })
    return c.json({ endpoint, secret }, 201)
  })

  .patch("/:id", async (c) => {
    const input = await parseJson(c, UpdateWebhookSchema)
    const scope = forOrganization(c.get("organizationId"))
    const existing = await prisma.webhookEndpoint.findFirst({
      where: scope.webhookEndpoint({ id: c.req.param("id") }),
      select: { id: true },
    })
    if (!existing) notFound("Webhook")
    let url: string | undefined
    if (input.url !== undefined) {
      try {
        url = validUrl(input.url)
      } catch (err) {
        return urlIssue((err as Error).message)
      }
    }
    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: existing.id },
      data: {
        ...(url !== undefined && { url }),
        ...(input.description !== undefined && { description: input.description || null }),
        ...(input.events !== undefined && { events: input.events }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
      },
      select: endpointSelect,
    })
    return c.json({ endpoint })
  })

  .delete("/:id", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const existing = await prisma.webhookEndpoint.findFirst({
      where: scope.webhookEndpoint({ id: c.req.param("id") }),
      select: { id: true },
    })
    if (!existing) notFound("Webhook")
    // Deliveries go with it (cascade); queued jobs find nothing and stop.
    await prisma.webhookEndpoint.delete({ where: { id: existing.id } })
    return c.body(null, 204)
  })

  /** New secret, shown once. The old one stops working immediately. */
  .post("/:id/rotate-secret", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const existing = await prisma.webhookEndpoint.findFirst({
      where: scope.webhookEndpoint({ id: c.req.param("id") }),
      select: { id: true },
    })
    if (!existing) notFound("Webhook")
    const { secret, secretEncrypted, secretHint } = await newSecret()
    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: existing.id },
      data: { secretEncrypted, secretHint },
      select: endpointSelect,
    })
    return c.json({ endpoint, secret })
  })

  /** Queue a `webhook.test` event to this endpoint (even if it isn't subscribed to anything). */
  .post("/:id/test", async (c) => {
    const orgId = c.get("organizationId")
    const scope = forOrganization(orgId)
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: scope.webhookEndpoint({ id: c.req.param("id") }),
      select: { id: true },
    })
    if (!endpoint) notFound("Webhook")
    const delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        organizationId: orgId,
        eventId: `evt_${crypto.randomUUID().replace(/-/g, "")}`,
        type: WEBHOOK_TEST_EVENT,
        payload: { message: "Test event from Sahihi. Your endpoint is reachable." },
      },
      select: deliverySelect,
    })
    await enqueueWebhookDeliveries([delivery.id])
    return c.json({ delivery }, 202)
  })

  /** Send a FAILED delivery again (same event id, so receivers can de-duplicate). */
  .post("/:id/deliveries/:deliveryId/retry", async (c) => {
    const scope = forOrganization(c.get("organizationId"))
    const delivery = await prisma.webhookDelivery.findFirst({
      where: scope.webhookDelivery({
        id: c.req.param("deliveryId"),
        endpointId: c.req.param("id"),
      }),
      select: { id: true, status: true },
    })
    if (!delivery) notFound("Delivery")
    if (delivery.status !== "FAILED") badRequest("Only failed deliveries can be retried")
    const updated = await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "PENDING" },
      select: deliverySelect,
    })
    await enqueueWebhookDeliveries([delivery.id], { retryKey: String(Date.now()) })
    return c.json({ delivery: updated }, 202)
  })
