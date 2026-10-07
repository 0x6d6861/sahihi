import { describe, expect, test } from "bun:test"
import {
  inView,
  parseEnvelopeView,
  recipientSummary,
  signingProgress,
  viewCounts,
} from "./envelope-list"

describe("envelope list views", () => {
  test("unknown views fall back to all", () => {
    expect(parseEnvelopeView(undefined)).toBe("all")
    expect(parseEnvelopeView("nope")).toBe("all")
    expect(parseEnvelopeView(["drafts"])).toBe("all")
    expect(parseEnvelopeView("closed")).toBe("closed")
  })

  test("statuses group into views", () => {
    expect(inView("SENT", "active")).toBe(true)
    expect(inView("IN_PROGRESS", "active")).toBe(true)
    expect(inView("VOIDED", "closed")).toBe(true)
    expect(inView("DRAFT", "completed")).toBe(false)
    expect(inView("EXPIRED", "all")).toBe(true)
  })

  test("counts per view", () => {
    expect(viewCounts(["DRAFT", "SENT", "IN_PROGRESS", "COMPLETED", "VOIDED", "DECLINED"])).toEqual(
      {
        all: 6,
        drafts: 1,
        active: 2,
        completed: 1,
        closed: 2,
      },
    )
  })
})

describe("row summaries", () => {
  test("recipient names", () => {
    expect(recipientSummary([])).toBe("No recipients yet")
    expect(recipientSummary(["A"])).toBe("A")
    expect(recipientSummary(["A", "B"])).toBe("A and B")
    expect(recipientSummary(["A", "B", "C"])).toBe("A + 2 more")
  })

  test("viewers don't count towards signing", () => {
    expect(
      signingProgress([
        { role: "SIGNER", status: "SIGNED" },
        { role: "APPROVER", status: "SENT" },
        { role: "VIEWER", status: "PENDING" },
      ]),
    ).toEqual({ signed: 1, total: 2 })
  })
})
