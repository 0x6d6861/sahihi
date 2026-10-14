import { getEnv } from "@sahihi/config"
import {
  canConnectStorage,
  encryptSecret,
  StartOAuthConnectionSchema,
  signOAuthState,
  verifyOAuthState,
} from "@sahihi/core"
import { getOrgPlan, prisma } from "@sahihi/db"
import {
  DriveError,
  driveDestination,
  exchangeOAuthCode,
  type OAuthProvider,
  oauthAuthorizeUrl,
  oauthClient,
} from "@sahihi/infra"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { badRequest, parseJson } from "../lib/http"

/**
 * Connecting Google Drive or OneDrive as a sync destination (docs/storage.md → Cloud drives).
 * Mounted under /api/storage, so the session and `data:manage` checks already ran. The signed
 * `state` ties the callback to the person and workspace that started it.
 */

const SLUGS: Record<string, OAuthProvider> = { google: "GOOGLE_DRIVE", microsoft: "ONEDRIVE" }

/** Which providers this deployment offers (each needs its OAuth app configured). */
export function oauthProviders() {
  return {
    GOOGLE_DRIVE: Boolean(oauthClient("GOOGLE_DRIVE")),
    ONEDRIVE: Boolean(oauthClient("ONEDRIVE")),
  }
}

const settingsUrl = (query: Record<string, string>) => {
  const url = new URL("/settings/storage", getEnv().WEB_URL)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return url.toString()
}

async function countConnections(orgId: string) {
  const [sync, primary] = await Promise.all([
    prisma.storageConnection.count({ where: { organizationId: orgId, purpose: "SYNC" } }),
    prisma.storageConnection.count({ where: { organizationId: orgId, purpose: "PRIMARY" } }),
  ])
  return { sync, primary }
}

export const storageOAuth = new Hono<AppEnv>()
  /** Returns the provider's consent URL; the page navigates there. */
  .post("/start", async (c) => {
    const input = await parseJson(c, StartOAuthConnectionSchema)
    const orgId = c.get("organizationId")
    if (!oauthClient(input.provider)) badRequest("This provider isn't available")
    const allowed = canConnectStorage(
      await getOrgPlan(prisma, orgId),
      "SYNC",
      await countConnections(orgId),
    )
    if (!allowed.ok) {
      return c.json({ error: "plan_required", message: allowed.message }, 402)
    }
    const state = await signOAuthState(getEnv().BETTER_AUTH_SECRET, {
      o: orgId,
      u: c.get("user").id,
      p: input.provider,
      name: input.name,
      folderTemplate: input.folderTemplate,
      rootFolder: input.rootFolder,
      e: Math.floor(Date.now() / 1000) + 15 * 60,
    })
    return c.json({ url: oauthAuthorizeUrl(input.provider, state) })
  })

  /** The provider redirects the browser here. Always ends on Settings → Storage. */
  .get("/:slug/callback", async (c) => {
    const provider = SLUGS[c.req.param("slug")]
    const orgId = c.get("organizationId")
    const state = await verifyOAuthState(getEnv().BETTER_AUTH_SECRET, c.req.query("state") ?? "")
    if (!provider || !state || state.p !== provider) {
      return c.redirect(settingsUrl({ error: "The sign-in link expired. Try again." }))
    }
    if (state.o !== orgId || state.u !== c.get("user").id) {
      return c.redirect(
        settingsUrl({ error: "Finish connecting in the workspace you started from." }),
      )
    }
    if (c.req.query("error") || !c.req.query("code")) {
      return c.redirect(settingsUrl({ error: "Access wasn't granted." }))
    }
    let tokens: Awaited<ReturnType<typeof exchangeOAuthCode>>
    try {
      tokens = await exchangeOAuthCode(provider, c.req.query("code") as string)
    } catch (err) {
      const message = err instanceof DriveError ? err.message : "The sign-in failed."
      return c.redirect(settingsUrl({ error: message }))
    }
    const plan = await getOrgPlan(prisma, orgId)
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`storage:${orgId}`}))`
      const [sync, primary] = await Promise.all([
        tx.storageConnection.count({ where: { organizationId: orgId, purpose: "SYNC" } }),
        tx.storageConnection.count({ where: { organizationId: orgId, purpose: "PRIMARY" } }),
      ])
      if (!canConnectStorage(plan, "SYNC", { sync, primary }).ok) return null
      return tx.storageConnection.create({
        data: {
          organizationId: orgId,
          createdById: state.u,
          purpose: "SYNC",
          provider,
          name: state.name,
          auth: "OAUTH",
          secretEncrypted: await encryptSecret(getEnv().BETTER_AUTH_SECRET, tokens.refreshToken),
          accountEmail: tokens.accountEmail,
          rootFolder: state.rootFolder,
          folderTemplate: state.folderTemplate,
          status: "ACTIVE",
          lastCheckedAt: new Date(),
        },
        select: { id: true },
      })
    })
    if (!created) {
      return c.redirect(settingsUrl({ error: "Your plan's sync destinations are all in use." }))
    }
    return c.redirect(settingsUrl({ connected: created.id }))
  })

/** "Test connection" for a cloud drive: the refresh token still works and the drive answers. */
export async function testOAuthConnection(row: {
  id: string
  provider: string
  secretEncrypted: string | null
  rootFolder: string | null
  status: string
}) {
  let result: { ok: true } | { ok: false; step: "credentials"; message: string }
  try {
    const drive = await driveDestination(row, {
      onRefreshToken: async (secretEncrypted) => {
        await prisma.storageConnection.update({ where: { id: row.id }, data: { secretEncrypted } })
      },
    })
    await drive.check()
    result = { ok: true }
  } catch (err) {
    result = {
      ok: false,
      step: "credentials",
      message: err instanceof DriveError ? err.message : "The drive didn't answer",
    }
  }
  const connection = await prisma.storageConnection.update({
    where: { id: row.id },
    data: {
      lastCheckedAt: new Date(),
      lastError: result.ok ? null : result.message,
      status: result.ok ? "ACTIVE" : "FAILING",
    },
    select: {
      id: true,
      purpose: true,
      provider: true,
      name: true,
      accountEmail: true,
      rootFolder: true,
      folderTemplate: true,
      status: true,
      lastCheckedAt: true,
      lastError: true,
    },
  })
  return { connection, test: result }
}
