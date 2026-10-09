import { describe, expect, test } from "bun:test"
import {
  ConfirmAccountDeletionSchema,
  deletedUserEmail,
  deletionBlockers,
  hashDeletionToken,
} from "./deletion"

describe("account deletion", () => {
  test("blocks only workspaces where the user is the last owner", () => {
    const m = (role: string, ownerCount: number, id = role) => ({
      organizationId: id,
      organizationName: `Org ${id}`,
      organizationCreatedAt: new Date("2026-01-01"),
      role,
      ownerCount,
    })
    expect(deletionBlockers([m("member", 1), m("admin", 1), m("owner", 2)])).toEqual([])
    expect(deletionBlockers([m("owner", 1, "solo"), m("member", 1)])).toEqual([
      { id: "solo", name: "Org solo", createdAt: new Date("2026-01-01") },
    ])
  })

  test("placeholder email is per user and never deliverable", () => {
    expect(deletedUserEmail("u1")).toBe("deleted-u1@redacted.invalid")
  })

  test("tokens are hashed with their own prefix and must be long", async () => {
    expect(await hashDeletionToken("t")).not.toBe(await hashDeletionToken("u"))
    expect(await hashDeletionToken("t")).toMatch(/^[0-9a-f]{64}$/)
    expect(ConfirmAccountDeletionSchema.safeParse({ token: "short" }).success).toBe(false)
  })
})
