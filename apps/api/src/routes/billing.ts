import { billingPeriod, PLAN_IDS, PLANS, usageLevel } from "@sahihi/core"
import { countAssistantTurns, countEnvelopesSent, countSeats, getOrgPlan, prisma } from "@sahihi/db"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { requireOrg } from "../middleware/session"

/**
 * The workspace's plan and usage (docs/billing.md). Every member may read it (the web shows a
 * quota banner to whoever is about to send). Plans are changed by the Sahihi team for now.
 */
export const billing = new Hono<AppEnv>()
  .use(requireOrg)

  .get("/", async (c) => {
    const orgId = c.get("organizationId")
    const period = billingPeriod()
    const [plan, sent, seats, turns] = await Promise.all([
      getOrgPlan(prisma, orgId),
      countEnvelopesSent(prisma, orgId, period),
      countSeats(prisma, orgId),
      countAssistantTurns(prisma, orgId, period),
    ])
    const seatsUsed = seats.members + seats.pendingInvitations
    return c.json({
      plan,
      period: { start: period.start.toISOString(), end: period.end.toISOString() },
      envelopes: {
        used: sent,
        limit: plan.envelopesPerMonth,
        level: usageLevel(sent, plan.envelopesPerMonth),
      },
      seats: {
        members: seats.members,
        pendingInvitations: seats.pendingInvitations,
        used: seatsUsed,
        limit: plan.seats,
        level: usageLevel(seatsUsed, plan.seats),
      },
      assistant: {
        used: turns,
        limit: plan.assistantTurnsPerMonth,
        level: usageLevel(turns, plan.assistantTurnsPerMonth),
      },
      plans: PLAN_IDS.map((id) => PLANS[id]),
    })
  })
