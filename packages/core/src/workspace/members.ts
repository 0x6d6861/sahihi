import { z } from "zod"
import { hasPermission, ORG_ROLES, type OrgRole } from "./permissions"

/**
 * Members & invitations (docs/auth.md → Members & invitations).
 *
 * better-auth's organization plugin owns these endpoints and enforces them. The helpers below
 * mirror its rules (better-auth 1.7 `crud-members` / `crud-invites`) so the settings page only
 * offers what the server will accept. `apps/api/test/members.itest.ts` checks they agree.
 */

const CREATOR_ROLE: OrgRole = "owner"

const rolesOf = (role: string) =>
  role
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
const isOwner = (role: string) => rolesOf(role).includes(CREATOR_ROLE)

export const InviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(ORG_ROLES as [OrgRole, ...OrgRole[]]),
})
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>

/** Roles `viewerRole` may invite people as. Only owners may invite owners. */
export function invitableRoles(viewerRole: string): OrgRole[] {
  if (!hasPermission(viewerRole, { invitation: ["create"] })) return []
  return ORG_ROLES.filter((r) => r !== CREATOR_ROLE || isOwner(viewerRole))
}

/** Whether `viewerRole` may cancel pending invitations. */
export function canCancelInvitations(viewerRole: string): boolean {
  return hasPermission(viewerRole, { invitation: ["cancel"] })
}

export interface MemberRef {
  id: string
  role: string
}

export interface MemberActions {
  /** Roles the viewer may switch the target to (excluding the current one). Empty = read-only. */
  assignableRoles: OrgRole[]
  canRemove: boolean
}

/**
 * What `viewer` may do to `target` in the members table.
 * - Changing roles needs `member:update`, removing needs `member:delete`.
 * - Only an owner may touch an owner, or make someone an owner.
 * - The last owner can't be removed or demoted (the org would have no owner).
 * - Nobody removes themselves here; leaving is a separate action.
 */
export function memberActions(
  viewer: MemberRef,
  target: MemberRef,
  ownerCount: number,
): MemberActions {
  const self = viewer.id === target.id
  const targetIsOwner = isOwner(target.role)
  const viewerIsOwner = isOwner(viewer.role)
  const lastOwner = targetIsOwner && ownerCount <= 1
  const touchable = !targetIsOwner || viewerIsOwner

  const canUpdate = hasPermission(viewer.role, { member: ["update"] }) && touchable
  const assignableRoles = canUpdate
    ? ORG_ROLES.filter(
        (r) =>
          r !== target.role &&
          (r !== CREATOR_ROLE || viewerIsOwner) &&
          // Demoting the last owner leaves the org without one.
          !(lastOwner && r !== CREATOR_ROLE),
      )
    : []

  const canRemove =
    !self && !lastOwner && touchable && hasPermission(viewer.role, { member: ["delete"] })

  return { assignableRoles, canRemove }
}

export type InvitationState = "pending" | "expired" | "accepted" | "rejected" | "canceled"

/** better-auth keeps `status: "pending"` after expiry; expired invitations can't be accepted. */
export function invitationState(
  invitation: { status: string; expiresAt: string | Date },
  now: Date = new Date(),
): InvitationState {
  if (invitation.status !== "pending") return invitation.status as InvitationState
  return new Date(invitation.expiresAt) <= now ? "expired" : "pending"
}
