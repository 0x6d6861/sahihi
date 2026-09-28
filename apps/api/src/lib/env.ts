import type { AuthSession } from "../auth"

/** Hono context variables set by middleware. */
export interface AppEnv {
  Variables: {
    user: AuthSession["user"]
    session: AuthSession["session"]
    organizationId: string
    memberRole: string
  }
}
