import {
  apiKeyHint,
  CreateApiKeySchema,
  generateApiKey,
  hashApiKey,
  hasPermission,
} from "@sahihi/core"
import { forOrganization, prisma } from "@sahihi/db"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../lib/env"
import { forbidden, notFound, parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"

/**
 * Manage the workspace's public API keys from the app (docs/public-api.md). Owners and admins
 * only (`api:manage`). The key is returned once, on create; afterwards only its hint.
 */
const requireApiManager = createMiddleware<AppEnv>(async (c, next) => {
  if (!hasPermission(c.get("memberRole"), { api: ["manage"] })) {
    forbidden("Only owners and admins can manage API keys")
  }
  await next()
})

const keySelect = {
  id: true,
  name: true,
  hint: true,
  scopes: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { name: true } },
} as const

export const MAX_API_KEYS = 20

export const apiKeys = new Hono<AppEnv>()
  .use(requireOrg)
  .use(requireApiManager)

  .get("/", async (c) => {
    const items = await prisma.apiKey.findMany({
      where: forOrganization(c.get("organizationId")).apiKey(),
      orderBy: { createdAt: "desc" },
      select: keySelect,
    })
    return c.json({ items })
  })

  .post("/", async (c) => {
    const input = await parseJson(c, CreateApiKeySchema)
    const organizationId = c.get("organizationId")
    const active = await prisma.apiKey.count({ where: { organizationId, revokedAt: null } })
    if (active >= MAX_API_KEYS) {
      return c.json(
        { error: "limit_reached", message: `Up to ${MAX_API_KEYS} active keys per workspace` },
        409,
      )
    }
    const key = generateApiKey()
    const created = await prisma.apiKey.create({
      data: {
        organizationId,
        createdById: c.get("user").id,
        name: input.name,
        scopes: input.scopes,
        secretHash: await hashApiKey(key),
        hint: apiKeyHint(key),
        expiresAt: input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000)
          : null,
      },
      select: keySelect,
    })
    return c.json({ apiKey: created, key }, 201)
  })

  /** Revoke: the key stops working immediately (kept for the record). */
  .delete("/:id", async (c) => {
    const existing = await prisma.apiKey.findFirst({
      where: forOrganization(c.get("organizationId")).apiKey({ id: c.req.param("id") }),
      select: { id: true, revokedAt: true },
    })
    if (!existing) notFound("API key")
    if (!existing.revokedAt) {
      await prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } })
    }
    return c.body(null, 204)
  })
