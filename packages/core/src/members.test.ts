import { describe, expect, test } from "bun:test"
import {
  canCancelInvitations,
  InviteMemberSchema,
  invitableRoles,
  invitationState,
  memberActions,
} from "./members"

const owner = { id: "m-owner", role: "owner" }
const owner2 = { id: "m-owner2", role: "owner" }
const admin = { id: "m-admin", role: "admin" }
const admin2 = { id: "m-admin2", role: "admin" }
const member = { id: "m-member", role: "member" }
const member2 = { id: "m-member2", role: "member" }

describe("InviteMemberSchema", () => {
  test("normalizes the email and accepts known roles only", () => {
    expect(InviteMemberSchema.parse({ email: "  Wanjiru@Example.CO.KE ", role: "admin" })).toEqual({
      email: "wanjiru@example.co.ke",
      role: "admin",
    })
    expect(InviteMemberSchema.safeParse({ email: "nope", role: "member" }).success).toBe(false)
    expect(InviteMemberSchema.safeParse({ email: "a@b.co", role: "superuser" }).success).toBe(false)
  })
})

describe("invitations", () => {
  test("owners invite any role, admins not owners, members nobody", () => {
    expect(invitableRoles("owner")).toEqual(["owner", "admin", "member"])
    expect(invitableRoles("admin")).toEqual(["admin", "member"])
    expect(invitableRoles("member")).toEqual([])
  })

  test("owners and admins cancel invitations", () => {
    expect(canCancelInvitations("owner")).toBe(true)
    expect(canCancelInvitations("admin")).toBe(true)
    expect(canCancelInvitations("member")).toBe(false)
  })

  test("pending past expiresAt is expired; other statuses pass through", () => {
    const now = new Date("2026-09-28T12:00:00Z")
    expect(invitationState({ status: "pending", expiresAt: "2026-09-29T00:00:00Z" }, now)).toBe(
      "pending",
    )
    expect(invitationState({ status: "pending", expiresAt: "2026-09-28T11:59:59Z" }, now)).toBe(
      "expired",
    )
    expect(invitationState({ status: "accepted", expiresAt: "2020-01-01T00:00:00Z" }, now)).toBe(
      "accepted",
    )
  })
})

describe("memberActions", () => {
  test("members can't change anyone", () => {
    expect(memberActions(member, member2, 1)).toEqual({ assignableRoles: [], canRemove: false })
    expect(memberActions(member, admin, 1)).toEqual({ assignableRoles: [], canRemove: false })
  })

  test("admins manage admins and members, but never owners, and can't make owners", () => {
    expect(memberActions(admin, member, 1)).toEqual({ assignableRoles: ["admin"], canRemove: true })
    expect(memberActions(admin, admin2, 1)).toEqual({
      assignableRoles: ["member"],
      canRemove: true,
    })
    expect(memberActions(admin, owner, 2)).toEqual({ assignableRoles: [], canRemove: false })
  })

  test("owners manage everyone, including other owners", () => {
    expect(memberActions(owner, member, 1)).toEqual({
      assignableRoles: ["owner", "admin"],
      canRemove: true,
    })
    expect(memberActions(owner, owner2, 2)).toEqual({
      assignableRoles: ["admin", "member"],
      canRemove: true,
    })
  })

  test("the last owner can't be demoted or removed", () => {
    expect(memberActions(owner, owner, 1)).toEqual({ assignableRoles: [], canRemove: false })
  })

  test("nobody removes themselves from the table (leaving is separate)", () => {
    expect(memberActions(admin, admin, 1).canRemove).toBe(false)
    expect(memberActions(owner, owner, 2)).toEqual({
      assignableRoles: ["admin", "member"],
      canRemove: false,
    })
  })
})
