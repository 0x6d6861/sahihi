import { z } from "zod"

/**
 * Plans and quotas (docs/billing.md, ADR 0014). No payment provider yet: a workspace's plan is
 * set by the Sahihi team (`bun run billing:set-plan`). Limits are enforced by the API:
 * envelopes sent per month (Send → 402), seats (members + pending invitations) and AI assistant
 * replies per month (chat → 402).
 */

export const PLAN_IDS = ["free", "starter", "business", "enterprise"] as const
export type PlanId = (typeof PLAN_IDS)[number]
export const PlanIdSchema = z.enum(PLAN_IDS)

export interface Plan {
  id: PlanId
  name: string
  /** Envelopes that may be SENT per billing period; null = unlimited. */
  envelopesPerMonth: number | null
  /** Members + pending invitations; null = unlimited. */
  seats: number | null
  /** AI assistant replies per billing period (docs/ai-documents.md); null = unlimited. */
  assistantTurnsPerMonth: number | null
  description: string
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    envelopesPerMonth: 5,
    seats: 2,
    assistantTurnsPerMonth: 30,
    description: "Try Sahihi with a few envelopes a month.",
  },
  starter: {
    id: "starter",
    name: "Starter",
    envelopesPerMonth: 50,
    seats: 5,
    assistantTurnsPerMonth: 300,
    description: "For small teams sending agreements every week.",
  },
  business: {
    id: "business",
    name: "Business",
    envelopesPerMonth: 300,
    seats: 20,
    assistantTurnsPerMonth: 1500,
    description: "For busy teams, with templates and webhooks at volume.",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    envelopesPerMonth: null,
    seats: null,
    assistantTurnsPerMonth: null,
    description: "Unlimited envelopes and seats, agreed terms.",
  },
}

export const DEFAULT_PLAN: PlanId = "free"

/** Unknown or missing plan ids fall back to Free (never to unlimited). */
export function planFor(id: string | null | undefined): Plan {
  return PLANS[PlanIdSchema.safeParse(id).success ? (id as PlanId) : DEFAULT_PLAN]
}

// ── Billing period: calendar month in East Africa Time (UTC+3, no DST) ──────
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000

export interface BillingPeriod {
  start: Date
  /** Exclusive */
  end: Date
}

/** The calendar month (Africa/Nairobi) that contains `now`, as UTC instants. */
export function billingPeriod(now: Date = new Date()): BillingPeriod {
  const local = new Date(now.getTime() + EAT_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  return {
    start: new Date(Date.UTC(y, m, 1) - EAT_OFFSET_MS),
    end: new Date(Date.UTC(y, m + 1, 1) - EAT_OFFSET_MS),
  }
}

// ── Quotas ───────────────────────────────────────────────────────────────────
export type UsageLevel = "ok" | "warning" | "exceeded"

/** "warning" from 80 % of the limit, "exceeded" at the limit (nothing more can be sent). */
export function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null) return "ok"
  if (used >= limit) return "exceeded"
  return used >= Math.ceil(limit * 0.8) ? "warning" : "ok"
}

export type QuotaCheck =
  | { ok: true; remaining: number | null }
  | { ok: false; limit: number; used: number }

/** May one more envelope be sent this period? */
export function checkEnvelopeQuota(plan: Plan, sentThisPeriod: number): QuotaCheck {
  const limit = plan.envelopesPerMonth
  if (limit === null) return { ok: true, remaining: null }
  if (sentThisPeriod >= limit) return { ok: false, limit, used: sentThisPeriod }
  return { ok: true, remaining: limit - sentThisPeriod - 1 }
}

/** May the assistant reply once more this period? */
export function checkAssistantQuota(plan: Plan, turnsThisPeriod: number): QuotaCheck {
  const limit = plan.assistantTurnsPerMonth
  if (limit === null) return { ok: true, remaining: null }
  if (turnsThisPeriod >= limit) return { ok: false, limit, used: turnsThisPeriod }
  return { ok: true, remaining: limit - turnsThisPeriod - 1 }
}

/** May another person be invited/added? Pending invitations hold a seat. */
export function canAddSeat(plan: Plan, members: number, pendingInvitations: number): boolean {
  return plan.seats === null || members + pendingInvitations < plan.seats
}

export const quotaExceededMessage = (plan: Plan, resetsAt: Date) =>
  `Your ${plan.name} plan allows ${plan.envelopesPerMonth} envelopes a month, and they've all been sent. ` +
  `Sending resumes on ${resetsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Nairobi" })}, or ask the Sahihi team for a bigger plan.`

export const seatLimitMessage = (plan: Plan) =>
  `Your ${plan.name} plan includes ${plan.seats} seats (members and pending invitations). Remove someone or ask the Sahihi team for a bigger plan.`

export const assistantQuotaExceededMessage = (plan: Plan, resetsAt: Date) =>
  `Your ${plan.name} plan includes ${plan.assistantTurnsPerMonth} AI assistant replies a month, and they've all been used. ` +
  `The assistant is back on ${resetsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Nairobi" })}; until then you can still edit, fill in and finalise documents yourself, or ask the Sahihi team for a bigger plan.`
