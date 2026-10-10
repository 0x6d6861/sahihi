import { describe, expect, test } from "bun:test"
import { APP_NAV, HOME_HREF, initials, isFullPage, isNavActive } from "./nav"

describe("isNavActive", () => {
  test("matches the section and pages below it", () => {
    expect(isNavActive("/inbox", "/inbox")).toBe(true)
    expect(isNavActive("/files/x", "/files")).toBe(true)
  })
  test("does not match siblings sharing a prefix", () => {
    expect(isNavActive("/inbox-archive", "/inbox")).toBe(false)
    expect(isNavActive("/files", "/inbox")).toBe(false)
  })
  test("documents, envelopes and templates belong to All files, bulk sends to the Inbox (ADR 0041)", () => {
    expect(isNavActive("/documents/abc/prepare", "/files")).toBe(true)
    expect(isNavActive("/envelopes/abc", "/files")).toBe(true)
    expect(isNavActive("/templates/abc/use", "/files")).toBe(true)
    expect(isNavActive("/bulk-sends/abc", "/inbox")).toBe(true)
    expect(isNavActive("/envelopes/abc", "/inbox")).toBe(false)
    expect(isNavActive("/envelopes-archive", "/files")).toBe(false)
  })
})

describe("APP_NAV", () => {
  test("All files comes first and is home (ADR 0038)", () => {
    expect(APP_NAV.map((n) => n.href)).toEqual(["/files", "/inbox"])
    expect(HOME_HREF).toBe("/files")
  })
})

describe("isFullPage", () => {
  test("the draft envelope editor", () => {
    expect(isFullPage("/envelopes/abc/edit")).toBe(true)
    expect(isFullPage("/envelopes/abc/edit/")).toBe(true)
  })
  test("the AI document generator, not its list", () => {
    expect(isFullPage("/generate/abc")).toBe(true)
    expect(isFullPage("/generate")).toBe(false)
  })
  test("not the other app pages", () => {
    expect(isFullPage("/envelopes")).toBe(false)
    expect(isFullPage("/envelopes/abc")).toBe(false)
    expect(isFullPage("/envelopes/new")).toBe(false)
    expect(isFullPage("/templates/abc/edit")).toBe(false)
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
