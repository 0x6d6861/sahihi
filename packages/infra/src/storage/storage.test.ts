import { describe, expect, test } from "bun:test"
import { configureStorage, keys, objectVersion, platformStorage, releasePrefix } from "./index"

configureStorage({
  primaryFor: async () => null,
  recordRelease: async () => [],
})

// Both guards throw before any request is made, so no bucket is needed.
describe("storage guards", () => {
  test("releasePrefix refuses a prefix outside the workspace", async () => {
    await expect(releasePrefix("org-a", keys.orgPrefix("org-b"), "RETENTION")).rejects.toThrow(
      "outside workspace org-a",
    )
    await expect(releasePrefix("org-a", "org/", "WORKSPACE_DELETED")).rejects.toThrow()
    await expect(releasePrefix("org-a", keys.userPrefix("org-a"), "DELETED")).rejects.toThrow()
    await expect(releasePrefix("org-a", "org/org-a/envelopes/e1", "RETENTION")).rejects.toThrow()
  })

  test("deletePrefix refuses anything but a workspace or user folder", async () => {
    for (const prefix of ["", "org/", "org", "user/", "documents/x/", "org//", "staging/"]) {
      await expect(platformStorage().deletePrefix(prefix)).rejects.toThrow("Refusing")
    }
  })
})

describe("keys", () => {
  test("versioned keys never repeat; unversioned keys keep their old form", () => {
    expect(objectVersion()).toMatch(/^[0-9a-f]{8}$/)
    expect(objectVersion()).not.toBe(objectVersion())
    expect(keys.certificate("o", "e")).toBe("org/o/envelopes/e/certificate.pdf")
    expect(keys.certificate("o", "e", "abcd1234")).toBe(
      "org/o/envelopes/e/certificate-abcd1234.pdf",
    )
    expect(keys.staging(keys.original("o", "d"))).toBe("staging/org/o/documents/d/original.pdf")
  })
})
