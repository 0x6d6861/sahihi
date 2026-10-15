import { GettingStartedPreferenceSchema, gettingStarted, hasPermission } from "@sahihi/core"
import { countSeats, forOrganization, prisma } from "@sahihi/db"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"

/**
 * The Get started checklist on All files (ADR 0061, docs/ui.md): the caller's workspace's first
 * steps, worked out from what exists, and whether the caller hid it. Every member may read it; the
 * hidden flag is per member and workspace (`MemberPreference`).
 */
export const gettingStartedRoute = new Hono<AppEnv>()
  .use(requireOrg)

  .get("/", async (c) => {
    const organizationId = c.get("organizationId")
    const userId = c.get("user").id
    const scope = forOrganization(organizationId)
    const [workspace, seats, documents, sentEnvelopes, generatedDocuments, preference] =
      await Promise.all([
        prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
        countSeats(prisma, organizationId),
        prisma.document.count({ where: scope.document() }),
        prisma.envelope.count({ where: scope.envelope({ status: { not: "DRAFT" } }) }),
        prisma.generatedDocument.count({ where: scope.generatedDocument() }),
        prisma.memberPreference.findUnique({
          where: { userId_organizationId: { userId, organizationId } },
          select: { gettingStartedDismissedAt: true },
        }),
      ])
    const state = gettingStarted({
      // The caller is one of the members.
      teammates: Math.max(0, seats.members - 1) + seats.pendingInvitations,
      documents,
      sentEnvelopes,
      generatedDocuments,
    })
    return c.json({
      ...state,
      dismissed: Boolean(preference?.gettingStartedDismissedAt),
      workspaceName: workspace?.name ?? "",
      canInvite: hasPermission(c.get("memberRole"), { invitation: ["create"] }),
    })
  })

  .put("/", async (c) => {
    const { dismissed } = await parseJson(c, GettingStartedPreferenceSchema)
    const organizationId = c.get("organizationId")
    const userId = c.get("user").id
    const gettingStartedDismissedAt = dismissed ? new Date() : null
    await prisma.memberPreference.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      create: { userId, organizationId, gettingStartedDismissedAt },
      update: { gettingStartedDismissedAt },
    })
    return c.json({ dismissed })
  })
