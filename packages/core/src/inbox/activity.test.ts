import { describe, expect, test } from "bun:test"
import { AUDIT_EVENT_TYPES } from "../security/audit"
import {
  ACTIVITY_GROUPS,
  activityData,
  activityTypesFor,
  decodeActivityCursor,
  encodeActivityCursor,
  ListActivityQuerySchema,
} from "./activity"

describe("activity groups", () => {
  test("all leaves out step-by-step noise", () => {
    const all = activityTypesFor("all")
    expect(all).toContain("recipient.signed")
    expect(all).toContain("envelope.sent")
    expect(all).not.toContain("recipient.field_filled")
    expect(all).not.toContain("recipient.otp_sent")
    expect(all).not.toContain("recipient.link_opened")
  })
  test("every group is a subset of all, and no type is in two groups", () => {
    const all = activityTypesFor("all")
    const seen = new Set<string>()
    for (const group of ACTIVITY_GROUPS.filter((g) => g !== "all")) {
      for (const type of activityTypesFor(group)) {
        expect(all).toContain(type)
        expect(seen.has(type)).toBe(false)
        seen.add(type)
      }
    }
    expect([...seen].sort()).toEqual([...all].sort())
  })
  test("every type in all is a real audit type", () => {
    for (const type of activityTypesFor("all")) expect(AUDIT_EVENT_TYPES).toContain(type)
  })
})

describe("query", () => {
  test("defaults", () => {
    expect(ListActivityQuerySchema.parse({})).toMatchObject({ limit: 30, group: "all" })
  })
  test("search, person and period", () => {
    expect(ListActivityQuerySchema.parse({ q: " amina ", actor: "u1", period: "30d" })).toEqual({
      limit: 30,
      group: "all",
      q: "amina",
      actor: "u1",
      period: "30d",
    })
    expect(ListActivityQuerySchema.parse({ q: "" }).q).toBeUndefined()
  })
  test("rejects unknown groups and out-of-range limits", () => {
    expect(ListActivityQuerySchema.safeParse({ group: "nope" }).success).toBe(false)
    expect(ListActivityQuerySchema.safeParse({ limit: "51" }).success).toBe(false)
  })
})

describe("cursor", () => {
  test("round-trips", () => {
    const item = { occurredAt: new Date("2026-10-01T10:00:00Z"), id: "cabc123" }
    expect(decodeActivityCursor(encodeActivityCursor(item))).toEqual(item)
  })
  test("rejects garbage", () => {
    expect(decodeActivityCursor("nope")).toBeNull()
  })
})

describe("activityData", () => {
  test("keeps what the line quotes, drops hashes, emails and keys", () => {
    expect(activityData({ signedS3Key: "k", signedSha256: "abc", name: "Lease.pdf" })).toEqual({
      name: "Lease.pdf",
    })
    expect(activityData({ code: "X1", sha256: "abc" })).toBeNull()
    expect(activityData({ email: "a@x.co" })).toBeNull()
    expect(activityData({ reason: "Wrong date", actorUserId: "u1" })).toEqual({
      reason: "Wrong date",
    })
    expect(
      activityData({ documents: [{ id: "d1", name: "A.pdf", sha256: "x" }, { id: "d2" }] }),
    ).toEqual({ documents: [{ name: "A.pdf" }] })
    expect(activityData(null)).toBeNull()
    expect(activityData(["x"])).toBeNull()
  })
})
