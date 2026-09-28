"use client"

import { organizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

/**
 * better-auth browser client. Requests go to /api/auth/* on the web origin
 * and are proxied to the API (next.config.ts rewrites).
 */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
})

export const { signIn, signUp, signOut, useSession, organization, useActiveOrganization } =
  authClient
