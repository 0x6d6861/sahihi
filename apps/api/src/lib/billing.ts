import { billingPeriod, checkEnvelopeQuota, quotaExceededMessage } from "@sahihi/core"
import { countEnvelopesSent, getOrgPlan, lockOrgQuota, type Prisma } from "@sahihi/db"
import { HTTPException } from "hono/http-exception"

/**
 * Envelope quota (docs/billing.md). Call inside the send transaction: it locks the workspace's
 * quota for the rest of the transaction, then refuses with 402 `quota_exceeded` at the limit.
 */
export async function assertEnvelopeQuota(tx: Prisma.TransactionClient, organizationId: string) {
  await lockOrgQuota(tx, organizationId)
  const period = billingPeriod()
  const [plan, used] = await Promise.all([
    getOrgPlan(tx, organizationId),
    countEnvelopesSent(tx, organizationId, period),
  ])
  const check = checkEnvelopeQuota(plan, used)
  if (!check.ok) {
    throw new HTTPException(402, {
      res: Response.json(
        {
          error: "quota_exceeded",
          message: quotaExceededMessage(plan, period.end),
          plan: plan.id,
          limit: check.limit,
          used: check.used,
          resetsAt: period.end.toISOString(),
        },
        { status: 402 },
      ),
    })
  }
}
