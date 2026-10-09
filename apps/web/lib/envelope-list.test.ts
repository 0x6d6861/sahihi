import { describe, expect, test } from "bun:test"
import { recipientSummary, signingProgress } from "./envelope-list"

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
