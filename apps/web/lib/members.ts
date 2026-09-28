import type { InvitationState, OrgRole } from "@sahihi/core"

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

export const INVITATION_BADGE: Record<
  InvitationState,
  { label: string; variant: "outline" | "warning" | "success" | "secondary" }
> = {
  pending: { label: "Pending", variant: "outline" },
  expired: { label: "Expired", variant: "warning" },
  accepted: { label: "Accepted", variant: "success" },
  rejected: { label: "Declined", variant: "secondary" },
  canceled: { label: "Canceled", variant: "secondary" },
}

/** Invitations worth listing: still pending, or expired and waiting to be resent or canceled. */
export const isOutstanding = (state: InvitationState) => state === "pending" || state === "expired"
