import {
  billingPeriod,
  checkEnvelopeQuota,
  type Plan,
  quotaExceededMessage,
  quotaNotificationFor,
} from "@sahihi/core"
import {
  countEnvelopesSent,
  getOrgPlan,
  lockOrgQuota,
  notifyWorkspaceAdmins,
  type Prisma,
} from "@sahihi/db"
import { EnvelopeError } from "./errors"

/**
 * Envelope quota (docs/billing.md). Call inside the send transaction: it locks the workspace's
 * quota for the rest of the transaction, then refuses with 402 `quota_exceeded` at the limit.
 * Returns the plan and the envelopes sent so far this period (before this one).
 */
export async function assertEnvelopeQuota(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<{ plan: Plan; used: number }> {
  await lockOrgQuota(tx, organizationId)
  const period = billingPeriod()
  const [plan, used] = await Promise.all([
    getOrgPlan(tx, organizationId),
    countEnvelopesSent(tx, organizationId, period),
  ])
  const check = checkEnvelopeQuota(plan, used)
  if (!check.ok) {
    throw new EnvelopeError(402, "quota_exceeded", quotaExceededMessage(plan, period.end), {
      plan: plan.id,
      limit: check.limit,
      used: check.used,
      resetsAt: period.end.toISOString(),
    })
  }
  return { plan, used }
}

/**
 * Tells the workspace's owners and admins when this send crosses 80% of the monthly quota or uses
 * the last envelope (docs/notifications.md). Call in the send transaction, after
 * `assertEnvelopeQuota`, with the count it returned: the quota lock makes each threshold fire once.
 */
export async function notifyQuotaUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  quota: { plan: Plan; used: number },
) {
  const usedAfter = quota.used + 1
  const type = quotaNotificationFor(quota.plan.envelopesPerMonth, usedAfter)
  if (!type) return
  await notifyWorkspaceAdmins(tx, {
    organizationId,
    type,
    data: {
      planName: quota.plan.name,
      used: usedAfter,
      limit: quota.plan.envelopesPerMonth ?? undefined,
    },
  })
}
