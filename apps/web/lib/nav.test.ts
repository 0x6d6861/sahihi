import { describe, expect, test } from "bun:test"
import { initials, isNavActive } from "./nav"

describe("isNavActive", () => {
  test("matches the section and pages below it", () => {
    expect(isNavActive("/envelopes", "/envelopes")).toBe(true)
    expect(isNavActive("/envelopes/abc", "/envelopes")).toBe(true)
  })
  test("does not match siblings sharing a prefix", () => {
    expect(isNavActive("/envelopes-archive", "/envelopes")).toBe(false)
    expect(isNavActive("/documents", "/envelopes")).toBe(false)
  })
})

describe("initials", () => {
  test("first and last word of the name", () => {
    expect(initials("Amina Wanjiru Otieno", "a@x.co")).toBe("AO")
    expect(initials("amina", "a@x.co")).toBe("A")
  })
  test("falls back to the email when the name is blank", () => {
    expect(initials("  ", "kip@x.co")).toBe("K")
    expect(initials(null, "kip@x.co")).toBe("K")
    expect(initials(undefined, "")).toBe("?")
  })
})
