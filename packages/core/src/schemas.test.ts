import { describe, expect, test } from "bun:test"
import { CONSENT_VERSION } from "./consent"
import {
  abandonedUploadCutoff,
  CreateUploadSchema,
  FieldInputSchema,
  ListDocumentsQuerySchema,
  RecipientInputSchema,
  ReplaceRecipientsSchema,
  SubmitSigningSchema,
  UPLOAD_ABANDON_AFTER_MS,
} from "./schemas"

describe("schemas", () => {
  test("field must lie within the page", () => {
    const base = { recipientId: "r1", type: "SIGNATURE", page: 1 }
    expect(
      FieldInputSchema.safeParse({ ...base, x: 0.1, y: 0.1, width: 0.2, height: 0.05 }).success,
    ).toBe(true)
    expect(
      FieldInputSchema.safeParse({ ...base, x: 0.9, y: 0.1, width: 0.2, height: 0.05 }).success,
    ).toBe(false)
  })
  test("recipient email is normalised and phone is E.164", () => {
    const ok = RecipientInputSchema.parse({
      name: "Amina",
      email: " Amina@Example.COM ",
      phone: "+254712345678",
    })
    expect(ok.email).toBe("amina@example.com")
    expect(ok.role).toBe("SIGNER")
    expect(
      RecipientInputSchema.safeParse({ name: "A", email: "a@b.co", phone: "0712345678" }).success,
    ).toBe(false)
  })
  test("signing requires explicit consent", () => {
    expect(
      SubmitSigningSchema.safeParse({ consent: false, consentVersion: CONSENT_VERSION, values: [] })
        .success,
    ).toBe(false)
    expect(
      SubmitSigningSchema.safeParse({ consent: true, consentVersion: CONSENT_VERSION, values: [] })
        .success,
    ).toBe(true)
  })
  test("documents list page is a bounded positive integer", () => {
    expect(ListDocumentsQuerySchema.parse({})).toEqual({ page: 1 })
    expect(ListDocumentsQuerySchema.parse({ page: "3" })).toEqual({ page: 3 })
    for (const page of ["0", "-1", "1.5", "abc", "10001"]) {
      expect(ListDocumentsQuerySchema.safeParse({ page }).success).toBe(false)
    }
  })
  test("abandoned uploads are those older than an hour", () => {
    expect(UPLOAD_ABANDON_AFTER_MS).toBe(3_600_000)
    const now = new Date("2026-09-26T12:00:00Z")
    expect(abandonedUploadCutoff(now).toISOString()).toBe("2026-09-26T11:00:00.000Z")
    expect(abandonedUploadCutoff(now, 0)).toEqual(now)
  })
  test("SMS verification requires a phone number", () => {
    const base = { name: "Amina", email: "a@example.com", verification: "SMS_OTP" }
    const missing = RecipientInputSchema.safeParse(base)
    expect(missing.success).toBe(false)
    expect(missing.error?.issues[0]?.path).toEqual(["phone"])
    expect(RecipientInputSchema.safeParse({ ...base, phone: "+254712345678" }).success).toBe(true)
    expect(RecipientInputSchema.safeParse({ ...base, verification: "EMAIL_OTP" }).success).toBe(
      true,
    )
  })
  test("recipient emails must be unique after normalisation", () => {
    const res = ReplaceRecipientsSchema.safeParse({
      recipients: [
        { name: "A", email: "a@example.com" },
        { name: "B", email: "b@example.com" },
        { name: "A again", email: " A@Example.com " },
      ],
    })
    expect(res.success).toBe(false)
    expect(res.error?.issues.map((i) => i.path)).toEqual([["recipients", 2, "email"]])
  })
  test("uploads may name a source document for lineage", () => {
    const base = { name: "a.pdf", sizeBytes: 10, contentType: "application/pdf" }
    expect(CreateUploadSchema.parse(base).sourceDocumentId).toBeUndefined()
    expect(CreateUploadSchema.parse({ ...base, sourceDocumentId: "doc_1" }).sourceDocumentId).toBe(
      "doc_1",
    )
    expect(CreateUploadSchema.safeParse({ ...base, sourceDocumentId: "" }).success).toBe(false)
  })
})
