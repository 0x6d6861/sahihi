import { API_KEY_RE, type ApiKeyScope, hashApiKey, hasScope } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createMiddleware } from "hono/factory"

export interface ApiKeyEnv {
  Variables: {
    organizationId: string
    apiKey: { id: string; name: string; scopes: string[]; createdById: string }
  }
}

const unauthorized = (message: string) =>
  Response.json(
    { error: "unauthorized", message },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="sahihi"' },
    },
  )

/**
 * Public API authentication (docs/public-api.md): `Authorization: Bearer sahihi_sk_…`.
 * The key's hash is looked up; revoked or expired keys are refused. `lastUsedAt` is updated at
 * most once a minute. Scopes are checked per route with `requireScope`.
 */
export const requireApiKey = createMiddleware<ApiKeyEnv>(async (c, next) => {
  const header = c.req.header("authorization") ?? ""
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!API_KEY_RE.test(key)) return unauthorized("Missing or malformed API key")
  const row = await prisma.apiKey.findUnique({
    where: { secretHash: await hashApiKey(key) },
    select: {
      id: true,
      name: true,
      scopes: true,
      createdById: true,
      organizationId: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  })
  const now = new Date()
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now)) {
    return unauthorized("Invalid, revoked or expired API key")
  }
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: now } })
  }
  c.set("organizationId", row.organizationId)
  c.set("apiKey", { id: row.id, name: row.name, scopes: row.scopes, createdById: row.createdById })
  await next()
})

export const requireScope = (scope: ApiKeyScope) =>
  createMiddleware<ApiKeyEnv>(async (c, next) => {
    if (!hasScope(c.get("apiKey").scopes, scope)) {
      return c.json(
        {
          error: "insufficient_scope",
          message: `This API key doesn't have the "${scope}" permission`,
          required: scope,
        },
        403,
      )
    }
    await next()
  })
