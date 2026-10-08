import { DELETED_USER_NAME, deletedUserEmail, deletionBlockers } from "@sahihi/core"
import { type Prisma, prisma } from "@sahihi/db"
import { conflict } from "./http"

/**
 * Deleting an account (ADR 0040, docs/auth.md → Delete account): erase the person, keep their
 * work. The `User` row stays as "Deleted user" because the workspaces' documents, envelopes,
 * templates and folders point at it; certificates already issued keep the name they were made with.
 */

/** Verification rows for pending deletions: `delete-account:<token hash>` → user id. */
export const deletionIdentifier = (tokenHash: string) => `delete-account:${tokenHash}`

/** Workspaces the user is the last owner of (deleting would orphan them). */
export async function deletionBlockersFor(userId: string, db: Prisma.TransactionClient = prisma) {
  const memberships = await db.member.findMany({
    where: { userId },
    select: { organizationId: true, role: true, organization: { select: { name: true } } },
  })
  const owners = await db.member.groupBy({
    by: ["organizationId"],
    where: {
      organizationId: { in: memberships.map((m) => m.organizationId) },
      role: { contains: "owner" },
    },
    _count: { _all: true },
  })
  const ownerCount = new Map(owners.map((o) => [o.organizationId, o._count._all]))
  return deletionBlockers(
    memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      role: m.role,
      ownerCount: ownerCount.get(m.organizationId) ?? 0,
    })),
  )
}

/**
 * Erase the user in one transaction: sign-in methods (sessions, password, 2FA, passkeys),
 * memberships, pending deletion links, picture and saved signatures (rows here; the files under
 * `user/<id>/` are the worker's `user.purge-storage`), notifications, and their API keys are
 * revoked. Name and email become placeholders; invitations to the old address and every pending
 * link for the user (deletion, password reset) go too. Returns false when the user is already gone.
 *
 * The last-owner check runs here, after locking every member row of the user's workspaces: two
 * co-owners deleting at once would otherwise both see the other as owner and leave none. 409 when
 * a workspace would be orphaned.
 */
export async function eraseUser(userId: string, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!user || user.email === deletedUserEmail(userId)) return false
    await tx.$executeRaw`SELECT id FROM "member" WHERE "organizationId" IN (SELECT "organizationId" FROM "member" WHERE "userId" = ${userId}) ORDER BY id FOR UPDATE`
    const blockers = await deletionBlockersFor(userId, tx)
    if (blockers.length > 0) {
      conflict(
        `You're now the only owner of ${blockers.map((b) => b.name).join(", ")}. Make someone else an owner, or delete the workspace, first.`,
      )
    }
    await tx.session.deleteMany({ where: { userId } })
    await tx.account.deleteMany({ where: { userId } })
    await tx.twoFactor.deleteMany({ where: { userId } })
    await tx.passkey.deleteMany({ where: { userId } })
    await tx.member.deleteMany({ where: { userId } })
    // Deletion and password-reset links alike: a reset link must not give the erased row a password.
    await tx.verification.deleteMany({ where: { value: userId } })
    await tx.invitation.deleteMany({
      where: { email: { equals: user.email, mode: "insensitive" } },
    })
    await tx.userAvatar.deleteMany({ where: { userId } })
    await tx.savedSignature.deleteMany({ where: { userId } })
    await tx.notification.deleteMany({ where: { userId } })
    await tx.notificationPreference.deleteMany({ where: { userId } })
    // Keys act for the workspace but were issued by this person; nobody may use them after this.
    await tx.apiKey.updateMany({
      where: { createdById: userId, revokedAt: null },
      data: { revokedAt: now },
    })
    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_USER_NAME,
        email: deletedUserEmail(userId),
        emailVerified: false,
        image: null,
        twoFactorEnabled: false,
      },
    })
    return true
  })
}
