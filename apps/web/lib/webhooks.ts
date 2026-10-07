import type { WebhookDeliveryStatus } from "@sahihi/core"
import type { BadgeTone } from "./constants"

/** Delivery status as a coss Badge variant + label (docs/webhooks.md). */
export const DELIVERY_BADGE: Record<WebhookDeliveryStatus, { label: string; tone: BadgeTone }> = {
  SUCCEEDED: { label: "Delivered", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  PENDING: { label: "Pending", tone: "info" },
}

/** One-line outcome of the latest attempt, e.g. "HTTP 500 · 3 attempts". */
export function deliveryOutcome(d: {
  status: WebhookDeliveryStatus
  attempts: number
  lastStatusCode: number | null
  lastError: string | null
}): string {
  const tries = d.attempts === 1 ? "1 attempt" : `${d.attempts} attempts`
  if (d.attempts === 0) return "Waiting to be sent"
  if (d.status === "SUCCEEDED") return `HTTP ${d.lastStatusCode ?? 200} · ${tries}`
  const cause = d.lastError ?? (d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : "Error")
  return `${cause} · ${tries}${d.status === "PENDING" ? " · retrying" : ""}`
}

/** "whsec_…a1b2": enough to tell secrets apart, never the secret. */
export const maskedSecret = (hint: string) => `whsec_…${hint}`
