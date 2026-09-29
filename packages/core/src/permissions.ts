import { createAccessControl } from "better-auth/plugins/access"
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access"

/**
 * Organization roles and permissions (docs/auth.md → Roles).
 *
 * One access-control definition, shared by better-auth's organization plugin (server and client)
 * and our own routes. better-auth enforces its built-in resources (organization, member,
 * invitation…). The API enforces ours with `hasPermission` and the ownership helpers below.
 *
 * Every member may work on the documents and envelopes they created. The `*-any` actions extend
 * that to everyone else's in the org.
 */
export const orgStatements = {
  ...defaultStatements,
  document: ["create", "delete-any"],
  envelope: ["create", "manage-any"],
  template: ["create", "manage-any"],
  webhook: ["manage"],
  /** Retention settings, exports and purging closed envelopes (docs/data-retention.md). */
  data: ["manage"],
  billing: ["manage"],
} as const

export const orgAc = createAccessControl(orgStatements)

export const orgRoles = {
  owner: orgAc.newRole({
    ...ownerAc.statements,
    document: ["create", "delete-any"],
    envelope: ["create", "manage-any"],
    template: ["create", "manage-any"],
    webhook: ["manage"],
    data: ["manage"],
    billing: ["manage"],
  }),
  admin: orgAc.newRole({
    ...adminAc.statements,
    document: ["create", "delete-any"],
    envelope: ["create", "manage-any"],
    template: ["create", "manage-any"],
    webhook: ["manage"],
    data: ["manage"],
  }),
  member: orgAc.newRole({
    ...memberAc.statements,
    document: ["create"],
    envelope: ["create"],
    template: ["create"],
  }),
}

export type OrgRole = keyof typeof orgRoles
export const ORG_ROLES = Object.keys(orgRoles) as OrgRole[]

type Statements = typeof orgStatements
export type PermissionRequest = { [R in keyof Statements]?: Statements[R][number][] }

/**
 * Whether a member's role grants every requested action. `role` is `Member.role`, which
 * better-auth stores comma-separated when a member has several roles (any of them may grant).
 * Unknown roles grant nothing.
 */
export function hasPermission(role: string, request: PermissionRequest): boolean {
  return role
    .split(",")
    .map((r) => r.trim())
    .some((r) => {
      const def = orgRoles[r as OrgRole]
      return def ? def.authorize(request).success : false
    })
}

export interface Actor {
  userId: string
  role: string
}

/** Edit, send, remind or void an envelope: its creator, or a role with `envelope:manage-any`. */
export function canManageEnvelope(actor: Actor, envelope: { createdById: string }): boolean {
  return (
    envelope.createdById === actor.userId || hasPermission(actor.role, { envelope: ["manage-any"] })
  )
}

/** Delete a document: its uploader, or a role with `document:delete-any`. */
export function canDeleteDocument(actor: Actor, document: { uploadedById: string }): boolean {
  return (
    document.uploadedById === actor.userId ||
    hasPermission(actor.role, { document: ["delete-any"] })
  )
}

/** Rename or delete a template: its creator, or a role with `template:manage-any`. */
export function canManageTemplate(actor: Actor, template: { createdById: string }): boolean {
  return (
    template.createdById === actor.userId || hasPermission(actor.role, { template: ["manage-any"] })
  )
}
