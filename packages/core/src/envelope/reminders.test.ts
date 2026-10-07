import { describe, expect, test } from "bun:test"
import { MANUAL_REMINDER_COOLDOWN_MS, reminderAvailability } from "./reminders"

const now = new Date("2026-09-28T12:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms)
const invited = (over: Partial<Parameters<typeof reminderAvailability>[0]> = {}) => ({
  status: "SENT" as const,
  notifiedAt: ago(2 * MANUAL_REMINDER_COOLDOWN_MS),
  lastRemindedAt: null,
  ...over,
})

describe("reminderAvailability", () => {
  test("an invited recipient past the cooldown can be reminded (SENT or VIEWED)", () => {
    expect(reminderAvailability(invited(), "SENT", now)).toEqual({ ok: true })
    expect(reminderAvailability(invited({ status: "VIEWED" }), "IN_PROGRESS", now)).toEqual({
      ok: true,
    })
  })

  test("cooldown counts from the latest of invite and reminder, rounding up", () => {
    expect(reminderAvailability(invited({ notifiedAt: ago(10 * 60_000) }), "SENT", now)).toEqual({
      ok: false,
      reason: "cooldown",
      waitSec: 50 * 60,
    })
    expect(
      reminderAvailability(
        invited({ lastRemindedAt: ago(MANUAL_REMINDER_COOLDOWN_MS - 1500) }),
        "SENT",
        now,
      ),
    ).toEqual({ ok: false, reason: "cooldown", waitSec: 2 })
    expect(
      reminderAvailability(
        invited({ lastRemindedAt: ago(MANUAL_REMINDER_COOLDOWN_MS) }),
        "SENT",
        now,
      ),
    ).toEqual({ ok: true })
  })

  test("explains why not: done, not their turn, or envelope closed", () => {
    expect(reminderAvailability(invited({ status: "SIGNED" }), "IN_PROGRESS", now)).toEqual({
      ok: false,
      reason: "already_done",
    })
    expect(reminderAvailability(invited({ status: "DECLINED" }), "DECLINED", now).ok).toBe(false)
    expect(
      reminderAvailability(invited({ status: "PENDING", notifiedAt: null }), "SENT", now),
    ).toEqual({
      ok: false,
      reason: "not_their_turn",
    })
    for (const status of ["DRAFT", "VOIDED", "COMPLETED", "EXPIRED"] as const) {
      expect(reminderAvailability(invited(), status, now)).toEqual({
        ok: false,
        reason: "envelope_closed",
      })
    }
  })
})
