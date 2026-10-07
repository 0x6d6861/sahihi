import { describe, expect, test } from "bun:test"
import {
  AVATAR_SIZE,
  avatarProblem,
  avatarUrl,
  ChangeEmailSchema,
  MAX_AVATAR_BYTES,
  offersSavedSignature,
  SaveSignatureSchema,
} from "./profile"

describe("offersSavedSignature", () => {
  test("only when the signing page is addressed to the signed-in user", () => {
    expect(offersSavedSignature("amina@example.com", "amina@example.com")).toBe(true)
    expect(offersSavedSignature("amina@example.com", " Amina@Example.com ")).toBe(true)
    expect(offersSavedSignature("amina@example.com", "juma@example.com")).toBe(false)
  })

  test("never without both emails (signed out, or recipient not verified yet)", () => {
    expect(offersSavedSignature(null, "amina@example.com")).toBe(false)
    expect(offersSavedSignature("amina@example.com", null)).toBe(false)
    expect(offersSavedSignature("", "")).toBe(false)
  })
})

describe("schemas", () => {
  test("a saved signature must be a PNG data URL", () => {
    expect(
      SaveSignatureSchema.safeParse({ kind: "signature", dataUrl: "data:image/png;base64,AAAA" })
        .success,
    ).toBe(true)
    expect(
      SaveSignatureSchema.safeParse({ kind: "initials", dataUrl: "data:image/svg+xml;base64,AA" })
        .success,
    ).toBe(false)
    expect(
      SaveSignatureSchema.safeParse({ kind: "stamp", dataUrl: "data:image/png;base64,AAAA" })
        .success,
    ).toBe(false)
  })

  test("new email is trimmed and lowercased", () => {
    expect(ChangeEmailSchema.parse({ newEmail: "  New@Example.COM " }).newEmail).toBe(
      "new@example.com",
    )
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

describe("avatar", () => {
  test("URL is same-origin and versioned", () => {
    expect(avatarUrl("usr_1", "ab12")).toBe("/api/avatars/usr_1?v=ab12")
  })

  test("accepts a square PNG up to the size and refuses the rest", () => {
    expect(avatarProblem(pngHeader(AVATAR_SIZE, AVATAR_SIZE))).toBeNull()
    expect(avatarProblem(pngHeader(AVATAR_SIZE + 1, AVATAR_SIZE))).toContain("must fit")
    expect(avatarProblem(pngHeader(64, 64, MAX_AVATAR_BYTES))).toBe("The picture is too large")
    expect(avatarProblem(new Uint8Array([1, 2, 3]))).toBe("The picture must be a PNG image")
  })
})
