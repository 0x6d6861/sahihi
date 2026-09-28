import { describe, expect, test } from "bun:test"
import { reminderHint, statusSummary } from "./envelope-status"

describe("statusSummary", () => {
  test("headline counts signers only; one line per recipient; no links", () => {
    const text = statusSummary({
      title: "Lease",
      status: "IN_PROGRESS",
      expiresAt: "2026-10-01T20:59:59.999Z",
      recipients: [
        {
          name: "Amina",
          email: "a@x.test",
          role: "SIGNER",
          status: "SIGNED",
          signedAt: "2026-09-28T09:15:00Z",
        },
        { name: "Kip", email: "k@x.test", role: "APPROVER", status: "VIEWED" },
        { name: "Legal", email: "l@x.test", role: "VIEWER", status: "PENDING" },
      ],
    })
    expect(text).toBe(
      [
        "Lease: In progress (1 of 2 signed)",
        "Expires 2026-10-01 20:59 UTC",
        "",
        "- Amina <a@x.test>: signed 2026-09-28 09:15 UTC",
        "- Kip <k@x.test>: opened, not signed yet",
        "- Legal <l@x.test>: receives a copy",
      ].join("\n"),
    )
    expect(text).not.toMatch(/https?:|\/sign\//)
  })
})

describe("reminderHint", () => {
  test("explains each unavailable reason; null when available", () => {
    expect(reminderHint({ ok: true })).toBeNull()
    expect(reminderHint({ ok: false, reason: "cooldown", waitSec: 61 })).toBe(
      "Available again in 2 min",
    )
    expect(reminderHint({ ok: false, reason: "not_their_turn" })).toBe("Not their turn yet")
    expect(reminderHint({ ok: false, reason: "already_done" })).toBe("Already responded")
    expect(reminderHint({ ok: false, reason: "envelope_closed" })).toBe("Envelope is closed")
  })
})
