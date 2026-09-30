import { describe, expect, test } from "bun:test"
import { hasPermission } from "./permissions"
import {
  closedAt,
  exportFolderName,
  isClosed,
  REDACTED,
  RetentionSettingsSchema,
  retentionCutoff,
  retentionLabel,
} from "./retention"

describe("retention", () => {
  test("only closed envelopes can be purged", () => {
    expect(["COMPLETED", "DECLINED", "VOIDED", "EXPIRED"].every((s) => isClosed(s as never))).toBe(
      true,
    )
    expect(["DRAFT", "SENT", "IN_PROGRESS"].some((s) => isClosed(s as never))).toBe(false)
  })

  test("closedAt: completion, then voiding, then last update; null while open", () => {
    const u = new Date("2026-01-03T00:00:00Z")
    const c = new Date("2026-01-02T00:00:00Z")
    expect(closedAt({ status: "COMPLETED", completedAt: c, voidedAt: null, updatedAt: u })).toEqual(
      c,
    )
    expect(closedAt({ status: "VOIDED", completedAt: null, voidedAt: c, updatedAt: u })).toEqual(c)
    expect(
      closedAt({ status: "EXPIRED", completedAt: null, voidedAt: null, updatedAt: u }),
    ).toEqual(u)
    expect(closedAt({ status: "SENT", completedAt: null, voidedAt: null, updatedAt: u })).toBeNull()
  })

  test("cutoff: N years back; forever means no cutoff", () => {
    expect(retentionCutoff(7, new Date("2026-09-29T08:00:00Z"))).toEqual(
      new Date("2019-09-29T08:00:00Z"),
    )
    expect(retentionCutoff(null)).toBeNull()
    expect(retentionLabel(null)).toBe("Keep forever")
    expect(retentionLabel(1)).toBe("1 year after closing")
  })

  test("settings accept only the offered periods", () => {
    expect(RetentionSettingsSchema.safeParse({ retentionYears: 7 }).success).toBe(true)
    expect(RetentionSettingsSchema.safeParse({ retentionYears: null }).success).toBe(true)
    expect(RetentionSettingsSchema.safeParse({ retentionYears: 2 }).success).toBe(false)
    expect(RetentionSettingsSchema.safeParse({ retentionYears: 0 }).success).toBe(false)
  })

  test("redacted email stays unique per recipient and is not a real address", () => {
    expect(REDACTED.recipientEmail("r_123")).toBe("deleted-r_123@redacted.invalid")
  })

  test("owners and admins manage data; members don't", () => {
    expect(hasPermission("owner", { data: ["manage"] })).toBe(true)
    expect(hasPermission("admin", { data: ["manage"] })).toBe(true)
    expect(hasPermission("member", { data: ["manage"] })).toBe(false)
  })
})

describe("exportFolderName", () => {
  test("keeps Unicode, strips path characters, suffixes the id", () => {
    expect(exportFolderName("Lease / Ngũgĩ: Unit 4", "cmabc12345678")).toBe(
      "Lease Ngũgĩ Unit 4 (12345678)",
    )
    // No path separators survive, so a title cannot escape its folder in the ZIP.
    expect(exportFolderName("../../etc/passwd", "cm00000000xyz")).toBe(
      ".. .. etc passwd (00000xyz)",
    )
    expect(exportFolderName("tab\there", "cm1234567890")).toBe("tab here (34567890)")
    expect(exportFolderName("   ", "cm1234567890")).toBe("envelope (34567890)")
  })
})
