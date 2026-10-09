import { passkey } from "@better-auth/passkey"
import { getEnv } from "@sahihi/config"
import { canAddSeat, orgAc, orgRoles, seatLimitMessage } from "@sahihi/core"
import { countSeats, getOrgPlan, notifyWorkspaceAdmins, prisma } from "@sahihi/db"
import { createLogger, getQueues } from "@sahihi/infra"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { APIError } from "better-auth/api"
import { organization, twoFactor } from "better-auth/plugins"

/**
 * better-auth — authentication for SENDERS (SaaS users) only.
 * Signers never get accounts; they use recipient tokens (see routes/signing.ts).
 *
 * After changing plugins run `bun run auth:schema` and reconcile the Prisma schema.
 * Docs: docs/auth.md
 */
const env = getEnv()
const log = createLogger("auth")

const LOGO_MESSAGE = "Upload the logo in Settings → Workspace"

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
    // /forgot-password → email → /reset-password. A reset signs out every device: whoever knew the
    // old password may still hold a session.
    revokeSessionsOnPasswordReset: true,
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

  // Settings → Profile. A verified user confirms from their current address first; better-auth then
  // sends the usual verification email to the new one (docs/auth.md → Account settings).
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await getQueues().notifications.add("auth.change-email", {
          email: user.email,
          name: user.name,
          newEmail,
          url,
        })
      },
    },
  },

  databaseHooks: {
    user: {
      update: {
        // The picture is uploaded through PUT /api/me/avatar, which sets `image` to our own URL.
        // Refusing it here keeps `update-user` from pointing it anywhere else.
        before: async (user, ctx) => {
          // better-auth passes `image: undefined` on updates that don't touch it (a name change).
          if (ctx && "image" in user && user.image !== undefined) {
            throw new APIError("BAD_REQUEST", { message: "Upload a picture in Settings → Profile" })
          }
        },
      },
    },
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
    // Settings → Security: TOTP authenticator apps plus one-time backup codes. Sign-in answers
    // `twoFactorRedirect` and the web finishes it on /sign-in/two-factor.
    twoFactor({ issuer: "Sahihi" }),
    // Settings → Security and the sign-in page. The relying party is the web origin: the browser
    // calls /api/auth/* there (docs/auth.md → Cookies), so passkeys are bound to that host.
    passkey({
      rpID: new URL(env.WEB_URL).hostname,
      rpName: "Sahihi",
      origin: env.WEB_URL,
    }),
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
        // The logo is uploaded through PUT /api/workspace/logo, which stores our own public URL.
        // Refusing it here keeps arbitrary remote images (tracking pixels) out of emails.
        beforeCreateOrganization: async ({ organization }) => {
          if (organization.logo) throw new APIError("BAD_REQUEST", { message: LOGO_MESSAGE })
        },
        beforeUpdateOrganization: async ({ organization }) => {
          if (organization.logo !== undefined)
            throw new APIError("BAD_REQUEST", { message: LOGO_MESSAGE })
        },
        // Pending invitations hold a seat, so an invite that could never be accepted is refused now.
        beforeCreateInvitation: async ({ organization }) => {
          const plan = await getOrgPlan(prisma, organization.id)
          const { members, pendingInvitations } = await countSeats(prisma, organization.id)
          if (!canAddSeat(plan, members, pendingInvitations)) {
            throw new APIError("FORBIDDEN", { message: seatLimitMessage(plan) })
          }
        },
        // Inbox notification for the workspace's owners and admins (docs/notifications.md). The
        // membership is already committed by better-auth, so this is best effort: a failure here
        // must not turn a successful acceptance into an error for the new member.
        afterAcceptInvitation: async ({ member, user, organization }) => {
          try {
            await notifyWorkspaceAdmins(prisma, {
              organizationId: organization.id,
              type: "member.joined",
              exceptUserId: member.userId,
              data: { memberName: user.name || user.email },
            })
          } catch (err) {
            log.warn("member.joined notification not written", { err })
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
