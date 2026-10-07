import { describe, expect, test } from "bun:test"
import { initials, isFullBleed, isNavActive } from "./nav"

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

describe("isFullBleed", () => {
  test("the draft envelope editor", () => {
    expect(isFullBleed("/envelopes/abc/edit")).toBe(true)
    expect(isFullBleed("/envelopes/abc/edit/")).toBe(true)
  })
  test("not the other app pages", () => {
    expect(isFullBleed("/envelopes")).toBe(false)
    expect(isFullBleed("/envelopes/abc")).toBe(false)
    expect(isFullBleed("/envelopes/new")).toBe(false)
    expect(isFullBleed("/templates/abc/edit")).toBe(false)
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
