import { describe, expect, test } from "bun:test"
import { type PreflightInput, sendPreflight } from "./send-preflight"

const now = new Date("2026-09-26T12:00:00Z")
const signer = (id: string, over: Partial<PreflightInput["recipients"][number]> = {}) => ({
  id,
  name: id.toUpperCase(),
  role: "SIGNER" as const,
  verification: "LINK" as const,
  phone: null,
  ...over,
})
const sig = (recipientId: string) => ({ recipientId, type: "SIGNATURE" as const })

describe("sendPreflight", () => {
  test("a ready envelope has no issues", () => {
    expect(
      sendPreflight(
        {
          recipients: [signer("a"), signer("v", { role: "VIEWER" })],
          fields: [sig("a")],
          expiresAt: null,
        },
        now,
      ),
    ).toEqual([])
  })

  test("reports every problem at once, per recipient", () => {
    const issues = sendPreflight(
      {
        recipients: [
          signer("a"),
          signer("b", { verification: "SMS_OTP" }),
          signer("c", { role: "APPROVER", verification: "SMS_OTP", phone: "+254712345678" }),
        ],
        fields: [sig("c"), { recipientId: "a", type: "TEXT" }],
        expiresAt: new Date("2026-09-26T11:59:59Z"),
      },
      now,
    )
    expect(issues.map((i) => [i.code, i.recipientId])).toEqual([
      ["missing_signature_field", "a"],
      ["missing_signature_field", "b"],
      ["missing_phone", "b"],
      ["expiry_in_past", undefined],
    ])
  })

  test("approvers don't need a signature field; viewers alone aren't enough", () => {
    expect(
      sendPreflight(
        { recipients: [signer("c", { role: "APPROVER" })], fields: [], expiresAt: null },
        now,
      ),
    ).toEqual([])
    expect(
      sendPreflight(
        { recipients: [signer("v", { role: "VIEWER" })], fields: [], expiresAt: null },
        now,
      ).map((i) => i.code),
    ).toEqual(["no_signers"])
  })
})
