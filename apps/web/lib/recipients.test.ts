import { describe, expect, test } from "bun:test"
import {
  emptyRow,
  nextOrder,
  type RecipientRow,
  rowsFromSaved,
  toPayload,
  validateRecipients,
} from "./recipients"

const row = (over: Partial<RecipientRow>): RecipientRow => ({ ...emptyRow(1), ...over })

describe("toPayload", () => {
  test("omits blank phones, strips spaces and dashes, and sends order 1 for parallel", () => {
    const rows = [
      row({ name: "A", email: "a@x.co", phone: "  ", order: 3 }),
      row({ id: "r2", name: "B", email: "b@x.co", phone: "+254 712-345 678", order: 2 }),
    ]
    expect(toPayload(rows, "PARALLEL").recipients).toEqual([
      { name: "A", email: "a@x.co", role: "SIGNER", order: 1, verification: "LINK" },
      {
        id: "r2",
        name: "B",
        email: "b@x.co",
        phone: "+254712345678",
        role: "SIGNER",
        order: 1,
        verification: "LINK",
      },
    ])
    expect(toPayload(rows, "SEQUENTIAL").recipients.map((r) => r.order)).toEqual([3, 2])
  })
})

describe("validateRecipients", () => {
  test("keys errors by recipients.<index>.<field>", () => {
    const res = validateRecipients(
      [
        row({ name: "", email: "not-an-email" }),
        row({ name: "Sam", email: "sam@x.co", verification: "SMS_OTP" }),
        row({ name: "Sam 2", email: "SAM@x.co" }),
      ],
      "PARALLEL",
    )
    expect(res.ok).toBe(false)
    expect(!res.ok && Object.keys(res.errors).sort()).toEqual([
      "recipients.0.email",
      "recipients.0.name",
      "recipients.1.phone",
      "recipients.2.email",
    ])
  })
  test("an empty list is an error on the list itself", () => {
    const res = validateRecipients([], "PARALLEL")
    expect(!res.ok && Object.keys(res.errors)).toEqual(["recipients"])
  })
  test("valid rows produce the normalised body", () => {
    const res = validateRecipients([row({ name: " Amina ", email: " Amina@X.co " })], "PARALLEL")
    expect(res.ok && res.body.recipients[0]).toMatchObject({ name: "Amina", email: "amina@x.co" })
  })
})

describe("ordering helpers", () => {
  test("new rows go after the last step", () => {
    expect(nextOrder([])).toBe(1)
    expect(nextOrder([row({ order: 2 }), row({ order: 2 }), row({ order: 1 })])).toBe(3)
  })
  test("saved recipients become rows keyed by id", () => {
    const [r] = rowsFromSaved([
      {
        id: "r1",
        name: "A",
        email: "a@x.co",
        phone: null,
        role: "VIEWER",
        order: 1,
        verification: "LINK",
      },
    ])
    expect(r).toMatchObject({ key: "r1", id: "r1", phone: "" })
  })
})
