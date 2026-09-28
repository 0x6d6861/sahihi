import { describe, expect, test } from "bun:test"
import { formatCountdown } from "./countdown"

describe("formatCountdown", () => {
  test("formats minutes and zero-padded seconds", () => {
    expect(formatCountdown(27)).toBe("0:27")
    expect(formatCountdown(65)).toBe("1:05")
    expect(formatCountdown(0)).toBe("0:00")
  })
  test("rounds up partial seconds and clamps bad input", () => {
    expect(formatCountdown(4.2)).toBe("0:05")
    expect(formatCountdown(-3)).toBe("0:00")
    expect(formatCountdown(Number.NaN)).toBe("0:00")
  })
})
