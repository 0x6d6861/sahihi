import { describe, expect, test } from "bun:test"
import { isOutstanding, roleLabel } from "./members"

describe("roleLabel", () => {
  test("labels single, comma-separated and unknown roles", () => {
    expect(roleLabel("admin")).toBe("Admin")
    expect(roleLabel("member, admin")).toBe("Member, Admin")
    expect(roleLabel("auditor")).toBe("auditor")
  })
})

describe("isOutstanding", () => {
  test("pending and expired invitations are listed; finished ones aren't", () => {
    expect(isOutstanding("pending")).toBe(true)
    expect(isOutstanding("expired")).toBe(true)
    expect(isOutstanding("accepted")).toBe(false)
    expect(isOutstanding("canceled")).toBe(false)
  })
})
