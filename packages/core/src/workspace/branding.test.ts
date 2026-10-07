import { describe, expect, test } from "bun:test"
import { pngDimensions } from "../shared/png"
import {
  canEditWorkspace,
  canLeaveWorkspace,
  LOGO_MAX_HEIGHT,
  LOGO_MAX_WIDTH,
  logoProblem,
  MAX_LOGO_BYTES,
  workspaceLogoUrl,
} from "./branding"

describe("workspaceLogoUrl", () => {
  test("points at the public branding route with a cache-busting version", () => {
    expect(workspaceLogoUrl("https://app.sahihi.co.ke/", "org_1", "abc")).toBe(
      "https://app.sahihi.co.ke/api/branding/org_1/logo.png?v=abc",
    )
  })
})

describe("workspace permissions", () => {
  test("owners and admins edit the workspace, members don't", () => {
    expect(canEditWorkspace("owner")).toBe(true)
    expect(canEditWorkspace("admin")).toBe(true)
    expect(canEditWorkspace("member")).toBe(false)
    expect(canEditWorkspace("member,admin")).toBe(true)
  })

  test("everyone may leave except the last owner", () => {
    expect(canLeaveWorkspace("member", 1)).toBe(true)
    expect(canLeaveWorkspace("admin", 1)).toBe(true)
    expect(canLeaveWorkspace("owner", 1)).toBe(false)
    expect(canLeaveWorkspace("owner", 2)).toBe(true)
  })
})

/** Minimal PNG header (signature + IHDR start) with the given size. */
function pngHeader(width: number, height: number, extra = 0): Uint8Array {
  const bytes = new Uint8Array(33 + extra)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe("logo validation", () => {
  test("reads the PNG size", () => {
    expect(pngDimensions(pngHeader(320, 80))).toEqual({ width: 320, height: 80 })
    expect(
      pngDimensions(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    ).toBe(null)
  })

  test("accepts a PNG inside the box and refuses the rest", () => {
    expect(logoProblem(pngHeader(LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT))).toBeNull()
    expect(logoProblem(pngHeader(LOGO_MAX_WIDTH + 1, 10))).toContain("must fit")
    expect(logoProblem(pngHeader(10, 10, MAX_LOGO_BYTES))).toBe("The logo is too large")
    expect(logoProblem(pngHeader(0, 10))).toBe("The logo is empty")
    expect(logoProblem(new Uint8Array([1, 2, 3]))).toBe("The logo must be a PNG image")
  })
})
