import type { UsageLevel } from "@sahihi/core"

/** "3 of 5" / "12 (unlimited)" for usage lines. */
export function usageLabel(used: number, limit: number | null): string {
  return limit === null ? `${used} (unlimited)` : `${used} of ${limit}`
}

export const limitLabel = (limit: number | null, unit: string) =>
  limit === null ? `Unlimited ${unit}` : `${limit} ${unit}`

/** Banner copy for the envelope quota, or null when there's nothing to say. */
export function quotaBanner(
  level: UsageLevel,
  used: number,
  limit: number | null,
  resetsOn: string,
): { tone: "warning" | "danger"; title: string; description: string } | null {
  if (limit === null || level === "ok") return null
  if (level === "exceeded")
    return {
      tone: "danger",
      title: "Monthly envelope limit reached",
      description: `All ${limit} envelopes on your plan have been sent this month. Drafts are kept; sending resumes on ${resetsOn}.`,
    }
  return {
    tone: "warning",
    title: `${limit - used} ${limit - used === 1 ? "envelope" : "envelopes"} left this month`,
    description: `You've sent ${used} of ${limit}. The count resets on ${resetsOn}.`,
  }
}
