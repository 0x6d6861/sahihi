import type { InvitationState, OrgRole } from "@sahihi/core"
import type { BadgeTone } from "./constants"

/** Org roles as shown on the members page (docs/auth.md → Roles). */
export const MEMBER_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

export const MEMBER_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: "Everything, including billing and deleting the workspace.",
  admin: "Manages members and every document and envelope.",
  member: "Sends envelopes and manages their own documents and envelopes.",
}

/** `Member.role` may be comma-separated; show each known role, in ORG_ROLES order. */
export function roleLabel(role: string): string {
  const parts = role
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
  return parts.map((r) => MEMBER_ROLE_LABELS[r as OrgRole] ?? r).join(", ")
}

export const INVITATION_BADGE: Record<InvitationState, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "info" },
  expired: { label: "Expired", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Declined", tone: "neutral" },
  canceled: { label: "Canceled", tone: "neutral" },
}

/** Invitations worth listing: still pending, or expired and waiting to be resent or canceled. */
export const isOutstanding = (state: InvitationState) => state === "pending" || state === "expired"
