import { describe, expect, test } from "bun:test"
import { limitLabel, quotaBanner, usageLabel } from "./billing"

describe("billing labels", () => {
  test("usage and limits", () => {
    expect(usageLabel(3, 5)).toBe("3 of 5")
    expect(usageLabel(12, null)).toBe("12 (unlimited)")
    expect(limitLabel(null, "envelopes")).toBe("Unlimited envelopes")
    expect(limitLabel(50, "envelopes")).toBe("50 envelopes")
  })

  test("quota banner: none when fine or unlimited, warning near, error at the limit", () => {
    expect(quotaBanner("ok", 1, 5, "1 October")).toBeNull()
    expect(quotaBanner("exceeded", 9, null, "1 October")).toBeNull()
    expect(quotaBanner("warning", 4, 5, "1 October")).toMatchObject({
      tone: "warning",
      title: "1 envelope left this month",
    })
    expect(quotaBanner("exceeded", 5, 5, "1 October")?.description).toContain(
      "resumes on 1 October",
    )
  })
})
