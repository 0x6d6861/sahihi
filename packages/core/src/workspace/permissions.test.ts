import { describe, expect, test } from "bun:test"
import {
  canDeleteDocument,
  canManageEnvelope,
  canManageFolder,
  canManageTemplate,
  canMoveDocument,
  hasPermission,
  ORG_ROLES,
} from "./permissions"

describe("hasPermission (docs/auth.md → Roles)", () => {
  test("everyone can upload documents and create envelopes", () => {
    for (const role of ORG_ROLES) {
      expect(hasPermission(role, { document: ["create"], envelope: ["create"] })).toBe(true)
    }
  })

  test("owner and admin act on everyone's envelopes and documents; member doesn't", () => {
    expect(hasPermission("owner", { envelope: ["manage-any"], document: ["delete-any"] })).toBe(
      true,
    )
    expect(hasPermission("admin", { envelope: ["manage-any"], document: ["delete-any"] })).toBe(
      true,
    )
    expect(hasPermission("member", { envelope: ["manage-any"] })).toBe(false)
    expect(hasPermission("member", { document: ["delete-any"] })).toBe(false)
  })

  test("invite / remove members: owner and admin", () => {
    const request = { invitation: ["create" as const], member: ["delete" as const] }
    expect(hasPermission("owner", request)).toBe(true)
    expect(hasPermission("admin", request)).toBe(true)
    expect(hasPermission("member", request)).toBe(false)
  })

  test("billing and deleting the org: owner only", () => {
    expect(hasPermission("owner", { billing: ["manage"], organization: ["delete"] })).toBe(true)
    expect(hasPermission("admin", { billing: ["manage"] })).toBe(false)
    expect(hasPermission("admin", { organization: ["delete"] })).toBe(false)
    expect(hasPermission("member", { billing: ["manage"] })).toBe(false)
  })

  test("multi-role members (comma-separated) get the union; unknown roles get nothing", () => {
    expect(hasPermission("member,admin", { envelope: ["manage-any"] })).toBe(true)
    expect(hasPermission("member, owner", { billing: ["manage"] })).toBe(true)
    expect(hasPermission("superuser", { envelope: ["create"] })).toBe(false)
    expect(hasPermission("", { envelope: ["create"] })).toBe(false)
  })
})

describe("ownership", () => {
  const envelope = { createdById: "u-alice" }
  const document = { uploadedById: "u-alice" }

  test("a member manages only envelopes they created", () => {
    expect(canManageEnvelope({ userId: "u-alice", role: "member" }, envelope)).toBe(true)
    expect(canManageEnvelope({ userId: "u-bob", role: "member" }, envelope)).toBe(false)
  })

  test("owner and admin manage any envelope in the org", () => {
    expect(canManageEnvelope({ userId: "u-bob", role: "admin" }, envelope)).toBe(true)
    expect(canManageEnvelope({ userId: "u-bob", role: "owner" }, envelope)).toBe(true)
  })

  test("a member deletes only documents they uploaded", () => {
    expect(canDeleteDocument({ userId: "u-alice", role: "member" }, document)).toBe(true)
    expect(canDeleteDocument({ userId: "u-bob", role: "member" }, document)).toBe(false)
    expect(canDeleteDocument({ userId: "u-bob", role: "admin" }, document)).toBe(true)
  })
})

describe("templates", () => {
  test("everyone creates and uses templates; members manage only their own", () => {
    for (const role of ORG_ROLES) expect(hasPermission(role, { template: ["create"] })).toBe(true)
    const t = { createdById: "u-alice" }
    expect(canManageTemplate({ userId: "u-alice", role: "member" }, t)).toBe(true)
    expect(canManageTemplate({ userId: "u-bob", role: "member" }, t)).toBe(false)
    expect(canManageTemplate({ userId: "u-bob", role: "admin" }, t)).toBe(true)
    expect(canManageTemplate({ userId: "u-bob", role: "owner" }, t)).toBe(true)
  })
})

describe("folders", () => {
  test("everyone creates folders; members rename/delete only their own", () => {
    for (const role of ORG_ROLES) expect(hasPermission(role, { folder: ["create"] })).toBe(true)
    const f = { createdById: "u-alice" }
    expect(canManageFolder({ userId: "u-alice", role: "member" }, f)).toBe(true)
    expect(canManageFolder({ userId: "u-bob", role: "member" }, f)).toBe(false)
    expect(canManageFolder({ userId: "u-bob", role: "admin" }, f)).toBe(true)
    expect(canManageFolder({ userId: "u-bob", role: "owner" }, f)).toBe(true)
  })

  test("moving a document follows the delete rule", () => {
    const d = { uploadedById: "u-alice" }
    expect(canMoveDocument({ userId: "u-alice", role: "member" }, d)).toBe(true)
    expect(canMoveDocument({ userId: "u-bob", role: "member" }, d)).toBe(false)
    expect(canMoveDocument({ userId: "u-bob", role: "admin" }, d)).toBe(true)
  })
})

describe("webhooks", () => {
  test("only owners and admins configure webhooks", () => {
    expect(hasPermission("owner", { webhook: ["manage"] })).toBe(true)
    expect(hasPermission("admin", { webhook: ["manage"] })).toBe(true)
    expect(hasPermission("member", { webhook: ["manage"] })).toBe(false)
  })
})
