import { getEnv } from "@sahihi/config"
import { canAddSeat, orgAc, orgRoles, seatLimitMessage } from "@sahihi/core"
import { countSeats, getOrgPlan, prisma } from "@sahihi/db"
import { getQueues } from "@sahihi/infra"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { APIError } from "better-auth/api"
import { organization } from "better-auth/plugins"

/**
 * better-auth — authentication for SENDERS (SaaS users) only.
 * Signers never get accounts; they use recipient tokens (see routes/signing.ts).
 *
 * After changing plugins run `bun run auth:schema` and reconcile the Prisma schema.
 * Docs: docs/auth.md
 */
const env = getEnv()

export const auth = betterAuth({
  appName: "Sahihi",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      await getQueues().notifications.add("auth.reset-password", {
        email: user.email,
        name: user.name,
        url,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await getQueues().notifications.add("auth.verify-email", {
        email: user.email,
        name: user.name,
        url,
      })
    },
  },

  databaseHooks: {
    session: {
      create: {
        // New sessions start with no active org. Without this, every sign-in of an existing member
        // (owners and invitees alike) would land on /onboarding and create a duplicate workspace.
        // Their first workspace is active; the switcher changes it.
        before: async (session) => {
          const member = await prisma.member.findFirst({
            where: { userId: session.userId },
            orderBy: { createdAt: "asc" },
            select: { organizationId: true },
          })
          return {
            data: { ...session, activeOrganizationId: member?.organizationId ?? null },
          }
        },
      },
    },
  },

  plugins: [
    organization({
      // Every user can create their own workspace on sign-up
      allowUserToCreateOrganization: true,
      // Roles and permissions shared with our routes and the web client (docs/auth.md → Roles)
      ac: orgAc,
      roles: orgRoles,
      // Seats come from the plan (docs/billing.md). better-auth checks this when a member is added
      // or an invitation is accepted; unlimited plans get a very high number.
      membershipLimit: async (_user, organization) =>
        (await getOrgPlan(prisma, organization.id)).seats ?? 100_000,
      organizationHooks: {
        // Pending invitations hold a seat, so an invite that could never be accepted is refused now.
        beforeCreateInvitation: async ({ organization }) => {
          const plan = await getOrgPlan(prisma, organization.id)
          const { members, pendingInvitations } = await countSeats(prisma, organization.id)
          if (!canAddSeat(plan, members, pendingInvitations)) {
            throw new APIError("FORBIDDEN", { message: seatLimitMessage(plan) })
          }
        },
        // The DB rows cascade; stored files (PDFs, signatures, exports) are removed by the worker
        // (docs/data-retention.md → Deleting a workspace).
        afterDeleteOrganization: async ({ organization }) => {
          await getQueues().maintenance.add(
            "organization.purge-storage",
            { organizationId: organization.id },
            { jobId: `purge-org-${organization.id}`, attempts: 5 },
          )
        },
      },
      sendInvitationEmail: async (data) => {
        await getQueues().notifications.add("auth.org-invitation", {
          email: data.email,
          inviterName: data.inviter.user.name,
          organizationName: data.organization.name,
          url: `${env.WEB_URL}/accept-invitation/${data.id}`,
        })
      },
    }),
  ],

  advanced: { cookiePrefix: "sahihi" },
})

export type AuthSession = typeof auth.$Infer.Session
