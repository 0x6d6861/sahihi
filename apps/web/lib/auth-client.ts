"use client"

import { passkeyClient } from "@better-auth/passkey/client"
import { orgAc, orgRoles } from "@sahihi/core"
import { organizationClient, twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

/**
 * better-auth browser client. Requests go to /api/auth/* on the web origin
 * and are proxied to the API (next.config.ts rewrites).
 */
export const authClient = createAuthClient({
  // The sign-in form handles `twoFactorRedirect` itself (it keeps `?next=`), so no global redirect.
  plugins: [organizationClient({ ac: orgAc, roles: orgRoles }), twoFactorClient(), passkeyClient()],
})

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  organization,
  useActiveOrganization,
  twoFactor,
  updateUser,
  changeEmail,
  changePassword,
  revokeSession,
  revokeOtherSessions,
  passkey,
} = authClient
