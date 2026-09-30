import { describe, expect, test } from "bun:test"
import { deliveryOutcome, maskedSecret } from "./webhooks"

describe("deliveryOutcome", () => {
  test("describes the latest attempt", () => {
    expect(
      deliveryOutcome({ status: "PENDING", attempts: 0, lastStatusCode: null, lastError: null }),
    ).toBe("Waiting to be sent")
    expect(
      deliveryOutcome({ status: "SUCCEEDED", attempts: 1, lastStatusCode: 204, lastError: null }),
    ).toBe("HTTP 204 · 1 attempt")
    expect(
      deliveryOutcome({
        status: "PENDING",
        attempts: 3,
        lastStatusCode: 500,
        lastError: "HTTP 500",
      }),
    ).toBe("HTTP 500 · 3 attempts · retrying")
    expect(
      deliveryOutcome({
        status: "FAILED",
        attempts: 10,
        lastStatusCode: null,
        lastError: "No response within 10s",
      }),
    ).toBe("No response within 10s · 10 attempts")
  })

  test("masked secret shows only the hint", () => {
    expect(maskedSecret("a1b2")).toBe("whsec_…a1b2")
  })
})
