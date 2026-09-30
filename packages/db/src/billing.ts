import { type BillingPeriod, billingPeriod, type Plan, planFor } from "@sahihi/core"
import type { Prisma, PrismaClient } from "./generated/prisma/client"

type Db = PrismaClient | Prisma.TransactionClient

/** The workspace's plan (no Subscription row = Free). */
export async function getOrgPlan(db: Db, organizationId: string): Promise<Plan> {
  const sub = await db.subscription.findUnique({
    where: { organizationId },
    select: { plan: true },
  })
  return planFor(sub?.plan)
}

/** Envelopes SENT in the period. Usage is derived from envelopes, so there's no counter to drift. */
export function countEnvelopesSent(
  db: Db,
  organizationId: string,
  period: BillingPeriod = billingPeriod(),
): Promise<number> {
  return db.envelope.count({
    where: { organizationId, sentAt: { gte: period.start, lt: period.end } },
  })
}

/**
 * Serialises quota checks per workspace for the rest of the transaction, so two concurrent sends
 * can't both see "one left" and both go out.
 */
export async function lockOrgQuota(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quota:${organizationId}`}))`
}

/** Seats in use: members + pending, unexpired invitations. */
export async function countSeats(db: Db, organizationId: string, now: Date = new Date()) {
  const [members, pendingInvitations] = await Promise.all([
    db.member.count({ where: { organizationId } }),
    db.invitation.count({
      where: { organizationId, status: "pending", expiresAt: { gt: now } },
    }),
  ])
  return { members, pendingInvitations }
}
