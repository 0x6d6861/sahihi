import { describe, expect, test } from "bun:test"
import { keys, platformStorage, releasePrefix } from "./storage"

// Both guards throw before any request is made, so no bucket is needed.
describe("storage guards", () => {
  test("releasePrefix refuses a prefix outside the workspace", async () => {
    await expect(releasePrefix("org-a", keys.orgPrefix("org-b"), "retention")).rejects.toThrow(
      "outside workspace org-a",
    )
    await expect(releasePrefix("org-a", "org/", "workspace_deleted")).rejects.toThrow()
    await expect(releasePrefix("org-a", keys.userPrefix("org-a"), "deleted")).rejects.toThrow()
  })

  test("deletePrefix refuses anything but a workspace or user folder", async () => {
    for (const prefix of ["", "org/", "org", "user/", "documents/x/", "org//"]) {
      await expect(platformStorage().deletePrefix(prefix)).rejects.toThrow("Refusing")
    }
  })
})
