import {
  type Actor,
  canDeleteDocument,
  canManageEnvelope,
  canManageFolder,
  canManageTemplate,
  canMoveDocument,
} from "@sahihi/core"
import type { Context } from "hono"
import type { AppEnv } from "./env"
import { forbidden } from "./http"

/**
 * Role checks for routes behind `requireOrg` (docs/auth.md → Roles). The rules live in
 * `@sahihi/core` (`workspace/permissions.ts`). These helpers only read the caller and turn "no" into a 403.
 */
export const actor = (c: Context<AppEnv>): Actor => ({
  userId: c.get("user").id,
  role: c.get("memberRole"),
})

/** Members change only envelopes they created; owners and admins change any. */
export function assertCanManageEnvelope(c: Context<AppEnv>, envelope: { createdById: string }) {
  if (!canManageEnvelope(actor(c), envelope)) {
    forbidden("Only the sender, an admin or the owner can change this envelope")
  }
}

/** Members delete only documents they uploaded; owners and admins delete any. */
export function assertCanDeleteDocument(c: Context<AppEnv>, document: { uploadedById: string }) {
  if (!canDeleteDocument(actor(c), document)) {
    forbidden("Only the uploader, an admin or the owner can delete this document")
  }
}

/** Members rename/delete only templates they saved; owners and admins any. */
export function assertCanManageTemplate(c: Context<AppEnv>, template: { createdById: string }) {
  if (!canManageTemplate(actor(c), template)) {
    forbidden("Only the member who saved this template, an admin or the owner can change it")
  }
}

/** Members move only documents they uploaded; owners and admins move any. */
export function assertCanMoveDocument(c: Context<AppEnv>, document: { uploadedById: string }) {
  if (!canMoveDocument(actor(c), document)) {
    forbidden("Only the uploader, an admin or the owner can move this document")
  }
}

/** Members rename/move/delete only folders they created; owners and admins any. */
export function assertCanManageFolder(c: Context<AppEnv>, folder: { createdById: string }) {
  if (!canManageFolder(actor(c), folder)) {
    forbidden("Only the member who created this folder, an admin or the owner can change it")
  }
}
