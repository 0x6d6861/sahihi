import { beforeEach, describe, expect, test } from "bun:test"
import { invitableRoles, memberActions, ORG_ROLES, type OrgRole } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { auth } from "../src/auth"
import { createSender, joinOrganization, resetDb, type Sender } from "./helpers"

/**
 * The settings page offers only what `memberActions` / `invitableRoles` allow. These tests run
 * every viewer × target × action against better-auth itself, so a better-auth upgrade that
 * changes its rules fails here instead of showing buttons that error.
 */

const memberId = async (s: Sender) => {
  const m = await prisma.member.findFirst({
    where: { userId: s.userId, organizationId: s.organizationId },
    select: { id: true },
  })
  if (!m) throw new Error("not a member")
  return m.id
}

/** true if the better-auth call succeeds, false if it's refused. */
const allowed = (p: Promise<unknown>) =>
  p.then(
    () => true,
    () => false,
  )

beforeEach(resetDb)

describe("memberActions matches better-auth", () => {
  for (const viewerRole of ORG_ROLES) {
    for (const targetRole of ORG_ROLES) {
      test(`${viewerRole} → ${targetRole}`, async () => {
        const creator = await createSender("creator")
        const viewer =
          viewerRole === "owner" ? creator : await joinOrganization(creator, "viewer", viewerRole)
        const target = await joinOrganization(creator, "target", targetRole)
        const [viewerId, targetId] = await Promise.all([memberId(viewer), memberId(target)])
        const ownerCount = await prisma.member.count({
          where: { organizationId: creator.organizationId, role: "owner" },
        })
        const predicted = memberActions(
          { id: viewerId, role: viewerRole },
          { id: targetId, role: targetRole },
          ownerCount,
        )

        const headers = new Headers({ cookie: viewer.cookie })
        for (const role of ORG_ROLES.filter((r) => r !== targetRole)) {
          const ok = await allowed(
            auth.api.updateMemberRole({
              body: { memberId: targetId, role, organizationId: creator.organizationId },
              headers,
            }),
          )
          expect({ role, ok }).toEqual({ role, ok: predicted.assignableRoles.includes(role) })
          // Put the target back for the next attempt.
          await prisma.member.update({ where: { id: targetId }, data: { role: targetRole } })
        }

        const removed = await allowed(
          auth.api.removeMember({
            body: { memberIdOrEmail: targetId, organizationId: creator.organizationId },
            headers,
          }),
        )
        expect({ removed }).toEqual({ removed: predicted.canRemove })
      })
    }
  }

  test("the last owner can't demote themselves", async () => {
    const creator = await createSender("creator")
    const id = await memberId(creator)
    const predicted = memberActions({ id, role: "owner" }, { id, role: "owner" }, 1)
    expect(predicted.assignableRoles).toEqual([])
    const ok = await allowed(
      auth.api.updateMemberRole({
        body: { memberId: id, role: "admin", organizationId: creator.organizationId },
        headers: new Headers({ cookie: creator.cookie }),
      }),
    )
    expect(ok).toBe(false)
  })
})

describe("invitableRoles matches better-auth", () => {
  for (const viewerRole of ORG_ROLES) {
    test(viewerRole, async () => {
      const creator = await createSender("creator")
      const viewer =
        viewerRole === "owner" ? creator : await joinOrganization(creator, "viewer", viewerRole)
      const expected = invitableRoles(viewerRole)
      for (const role of ORG_ROLES as OrgRole[]) {
        const ok = await allowed(
          auth.api.createInvitation({
            body: {
              email: `${role}-${crypto.randomUUID().slice(0, 6)}@example.test`,
              role,
              organizationId: creator.organizationId,
            },
            headers: new Headers({ cookie: viewer.cookie }),
          }),
        )
        expect({ role, ok }).toEqual({ role, ok: expected.includes(role) })
      }
    })
  }
})

describe("sign-in activates a workspace", () => {
  const signIn = async (email: string, password: string) => {
    const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ")
    return auth.api.getSession({ headers: new Headers({ cookie }) })
  }

  test("a member's new session has their first workspace active (not /onboarding)", async () => {
    const creator = await createSender("creator")
    const email = `invitee-${crypto.randomUUID().slice(0, 6)}@example.test`
    const password = `pw-${crypto.randomUUID()}`
    const { user } = await auth.api.signUpEmail({ body: { email, password, name: "Invitee" } })
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    await auth.api.addMember({
      body: { userId: user.id, organizationId: creator.organizationId, role: "member" },
    })

    const session = await signIn(email, password)
    expect(session?.session.activeOrganizationId).toBe(creator.organizationId)
  })

  test("a user without workspaces still gets none (onboarding)", async () => {
    const email = `new-${crypto.randomUUID().slice(0, 6)}@example.test`
    const password = `pw-${crypto.randomUUID()}`
    const { user } = await auth.api.signUpEmail({ body: { email, password, name: "New" } })
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    const session = await signIn(email, password)
    expect(session?.session.activeOrganizationId ?? null).toBeNull()
  })
})
