import { describe, expect, test } from "bun:test"
import { AUDIT_EVENT_TYPES } from "@sahihi/core"
import { auditEventLabel, auditEventTone } from "./audit-labels"

describe("auditEventLabel", () => {
  test("every event type has a label (no raw type strings leak into the UI)", () => {
    for (const type of AUDIT_EVENT_TYPES) {
      expect(auditEventLabel(type, "Amina")).not.toBe(type)
    }
  })
  test("uses the recipient's name, or a neutral fallback", () => {
    expect(auditEventLabel("recipient.signed", "Amina")).toBe("Amina signed")
    expect(auditEventLabel("recipient.signed", null)).toBe("A recipient signed")
  })
  test("appends reasons for voids and declines only", () => {
    expect(auditEventLabel("envelope.voided", null, { reason: " Wrong version " })).toBe(
      "Envelope voided: “Wrong version”",
    )
    expect(auditEventLabel("envelope.sent", null, { reason: "x" })).toBe("Envelope sent")
  })
  test("unknown types fall back to the raw type", () => {
    expect(auditEventLabel("something.new", null)).toBe("something.new")
    expect(auditEventTone("something.new")).toBe("outline")
    expect(auditEventTone("recipient.signed")).toBe("success")
  })
})
