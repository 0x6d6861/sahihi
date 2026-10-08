import { describe, expect, test } from "bun:test"
import {
  decodeNotificationCursor,
  describeNotification,
  encodeNotificationCursor,
  isNotificationEnabled,
  ListNotificationsQuerySchema,
  MarkNotificationsReadSchema,
  NOTIFICATION_CATALOG,
  NOTIFICATION_REASON_MAX,
  NOTIFICATION_TYPES,
  NotificationIdsSchema,
  notificationTypesFor,
  parseNotificationSettings,
  quotaNotificationFor,
  receivesAdminNotifications,
  truncateReason,
  UpdateNotificationPreferencesSchema,
} from "./notifications"

describe("catalog", () => {
  test("every type is described", () => {
    expect(Object.keys(NOTIFICATION_CATALOG).sort()).toEqual([...NOTIFICATION_TYPES].sort())
  })
})

describe("audience", () => {
  test("owners and admins get workspace notifications, members don't", () => {
    expect(receivesAdminNotifications("owner")).toBe(true)
    expect(receivesAdminNotifications("admin")).toBe(true)
    expect(receivesAdminNotifications("member")).toBe(false)
    expect(receivesAdminNotifications("member,admin")).toBe(true)
    expect(receivesAdminNotifications("nonsense")).toBe(false)
  })
  test("types offered per role", () => {
    expect(notificationTypesFor("owner")).toEqual([...NOTIFICATION_TYPES])
    const member = notificationTypesFor("member")
    expect(member).toContain("envelope.completed")
    expect(member).toContain("export.ready")
    expect(member).not.toContain("member.joined")
    expect(member).not.toContain("billing.quota_reached")
  })
})

describe("preferences", () => {
  test("defaults apply until changed", () => {
    expect(isNotificationEnabled("envelope.completed", {})).toBe(true)
    expect(isNotificationEnabled("recipient.viewed", {})).toBe(false)
    expect(isNotificationEnabled("envelope.completed", { "envelope.completed": false })).toBe(false)
    expect(isNotificationEnabled("recipient.viewed", { "recipient.viewed": true })).toBe(true)
  })
  test("stored settings are read leniently", () => {
    expect(parseNotificationSettings(null)).toEqual({})
    expect(parseNotificationSettings([true])).toEqual({})
    expect(
      parseNotificationSettings({
        "envelope.completed": false,
        "made.up": true,
        "recipient.viewed": "yes",
      }),
    ).toEqual({ "envelope.completed": false })
  })
  test("updates accept known types only", () => {
    expect(
      UpdateNotificationPreferencesSchema.safeParse({ settings: { "envelope.declined": false } })
        .success,
    ).toBe(true)
    expect(UpdateNotificationPreferencesSchema.safeParse({ settings: {} }).success).toBe(true)
    expect(
      UpdateNotificationPreferencesSchema.safeParse({ settings: { "made.up": true } }).success,
    ).toBe(false)
    expect(
      UpdateNotificationPreferencesSchema.safeParse({ settings: { "envelope.declined": "no" } })
        .success,
    ).toBe(false)
  })
})

describe("tones", () => {
  test("done is success, needs attention is warning", () => {
    const tone = (type: string, data: object = {}) => describeNotification({ type, data }).tone
    expect(tone("envelope.completed")).toBe("success")
    expect(tone("export.ready")).toBe("success")
    expect(tone("bulk_send.finished", { sent: 3 })).toBe("success")
    expect(tone("envelope.declined")).toBe("warning")
    expect(tone("billing.quota_reached")).toBe("warning")
    expect(tone("recipient.signed")).toBe("info")
  })
})

describe("notification cursor", () => {
  test("round-trips the position", () => {
    const createdAt = new Date("2026-10-07T12:00:00.123Z")
    const cursor = encodeNotificationCursor({ createdAt, id: "cmabc123" })
    expect(cursor).toBe(`${createdAt.getTime()}.cmabc123`)
    expect(decodeNotificationCursor(cursor)).toEqual({ createdAt, id: "cmabc123" })
  })
  test("anything else is not a cursor", () => {
    for (const bad of ["", "cmabc123", "abc.def", "123.", ".abc", "123.a b", "1.2.3"]) {
      expect(decodeNotificationCursor(bad)).toBeNull()
    }
  })
})

describe("requests", () => {
  test("list query", () => {
    expect(ListNotificationsQuerySchema.parse({})).toEqual({ limit: 20, unread: false })
    expect(ListNotificationsQuerySchema.parse({ unread: "1", limit: "5", cursor: "abc" })).toEqual({
      limit: 5,
      unread: true,
      cursor: "abc",
    })
    expect(ListNotificationsQuerySchema.safeParse({ limit: "500" }).success).toBe(false)
  })
  test("ids-only actions refuse all", () => {
    expect(NotificationIdsSchema.safeParse({ ids: ["a"] }).success).toBe(true)
    expect(NotificationIdsSchema.safeParse({ all: true }).success).toBe(false)
  })
  test("mark read takes ids or all", () => {
    expect(MarkNotificationsReadSchema.safeParse({ ids: ["a"] }).success).toBe(true)
    expect(MarkNotificationsReadSchema.safeParse({ all: true }).success).toBe(true)
    expect(MarkNotificationsReadSchema.safeParse({ ids: [] }).success).toBe(false)
    expect(MarkNotificationsReadSchema.safeParse({ all: false }).success).toBe(false)
    expect(MarkNotificationsReadSchema.safeParse({}).success).toBe(false)
  })
})

describe("quotaNotificationFor", () => {
  test("warns once at 80% and once at the limit", () => {
    const fired = Array.from({ length: 6 }, (_, i) => quotaNotificationFor(5, i + 1))
    expect(fired).toEqual([
      null,
      null,
      null,
      "billing.quota_warning",
      "billing.quota_reached",
      null,
    ])
    expect(quotaNotificationFor(50, 40)).toBe("billing.quota_warning")
    expect(quotaNotificationFor(50, 41)).toBeNull()
    expect(quotaNotificationFor(50, 50)).toBe("billing.quota_reached")
  })
  test("tiny limits skip the warning when it would land on the limit", () => {
    expect(quotaNotificationFor(1, 1)).toBe("billing.quota_reached")
    expect(quotaNotificationFor(2, 1)).toBeNull()
    expect(quotaNotificationFor(2, 2)).toBe("billing.quota_reached")
  })
  test("unlimited plans never notify", () => {
    expect(quotaNotificationFor(null, 1_000)).toBeNull()
    expect(quotaNotificationFor(0, 0)).toBeNull()
  })
})

describe("describeNotification", () => {
  test("envelope events link to the envelope", () => {
    const v = describeNotification({
      type: "recipient.signed",
      envelopeId: "env1",
      data: { envelopeTitle: "Lease", recipientName: "Amina" },
    })
    expect(v).toEqual({
      title: "Amina signed “Lease”",
      body: "Waiting on the other recipients.",
      tone: "info",
      href: "/envelopes/env1",
    })
    expect(
      describeNotification({
        type: "envelope.completed",
        envelopeId: "e",
        data: { envelopeTitle: "NDA" },
      }).title,
    ).toBe("“NDA” is complete")
  })
  test("missing data falls back to generic words", () => {
    const declined = describeNotification({ type: "envelope.declined", data: null })
    expect(declined.title).toBe("Someone declined an envelope")
    expect(declined.body).toBe("No reason given.")
    expect(describeNotification({ type: "envelope.expired", data: {} }).title).toBe(
      "An envelope expired",
    )
  })
  test("reasons are quoted", () => {
    expect(
      describeNotification({ type: "envelope.declined", data: { reason: "Wrong address" } }).body,
    ).toBe("“Wrong address”")
  })
  test("workspace events link to settings", () => {
    expect(describeNotification({ type: "member.joined", data: { memberName: "Kip" } })).toEqual({
      title: "Kip joined the workspace",
      body: "They accepted your invitation. Manage roles in Settings → Members.",
      tone: "info",
      href: "/settings/members",
    })
    expect(
      describeNotification({
        type: "billing.quota_warning",
        data: { used: 4, limit: 5, planName: "Free" },
      }).body,
    ).toBe("4 of 5 envelopes sent this month on the Free plan.")
    expect(describeNotification({ type: "export.ready", data: { envelopeCount: 1 } }).body).toBe(
      "1 envelope. Download it from Settings → Data.",
    )
    expect(
      describeNotification({
        type: "bulk_send.finished",
        data: { bulkSendId: "b1", bulkSendTitle: "Offers", sent: 9, failed: 1 },
      }),
    ).toEqual({
      title: "Bulk send “Offers” finished",
      body: "9 sent, 1 failed",
      tone: "warning",
      href: "/bulk-sends/b1",
    })
  })
  test("every type has a specific title and a body", () => {
    for (const type of NOTIFICATION_TYPES) {
      const v = describeNotification({ type, data: {} })
      expect(v.title).not.toBe("Notification")
      expect(v.body.length).toBeGreaterThan(0)
    }
    expect(describeNotification({ type: "from.the.future", data: {} }).title).toBe("Notification")
  })
})

describe("truncateReason", () => {
  test("keeps short reasons, cuts long ones", () => {
    expect(truncateReason(null)).toBeUndefined()
    expect(truncateReason("  Not me  ")).toBe("Not me")
    const long = truncateReason("x".repeat(500))
    expect(long?.length).toBe(NOTIFICATION_REASON_MAX)
    expect(long?.endsWith("…")).toBe(true)
  })
})
