import { z } from "zod"
import { sha256Hex } from "../security/crypto"
import { canLeaveWorkspace } from "../workspace/branding"

/**
 * Deleting an account (docs/auth.md → Delete account, ADR 0040). The user row stays, because
 * documents, envelopes, templates and folders they created belong to their workspaces and point
 * at it. Everything personal is erased: name and email become placeholders, and sign-in methods,
 * memberships, picture, saved signatures and notifications go.
 */

/** What the erased user is called wherever their work still shows. */
export const DELETED_USER_NAME = "Deleted user"

/** Keeps `User.email` unique without holding a real address (like redacted recipients). */
export const deletedUserEmail = (userId: string) => `deleted-${userId}@redacted.invalid`

/** The emailed confirmation link works this long. */
export const DELETE_ACCOUNT_TTL_SECONDS = 60 * 60

/** Step 1, from Settings → Security: the password, so a borrowed session isn't enough. */
export const RequestAccountDeletionSchema = z.object({
  password: z.string().min(1, "Enter your password"),
})

/** Step 2, from the emailed link. */
export const ConfirmAccountDeletionSchema = z.object({
  token: z.string().min(32).max(128),
})

/** Only the hash of the emailed token is stored (like signing tokens). */
export const hashDeletionToken = (token: string) => sha256Hex(`delete-account:${token}`)

export interface Membership {
  organizationId: string
  organizationName: string
  role: string
  ownerCount: number
}

/**
 * Workspaces that would be left without an owner: the user must hand ownership on (or delete the
 * workspace) first. Empty means the account can be deleted.
 */
export function deletionBlockers(memberships: readonly Membership[]) {
  return memberships
    .filter((m) => !canLeaveWorkspace(m.role, m.ownerCount))
    .map((m) => ({ id: m.organizationId, name: m.organizationName }))
}
