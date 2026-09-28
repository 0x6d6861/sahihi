import { z } from "zod"
import { FIELD_TYPES, RECIPIENT_ROLES, SIGNING_ORDERS, VERIFICATION_METHODS } from "./enums"

/**
 * Request/response validators shared by the API (server-side validation) and
 * the web app (form validation). Keep them transport-agnostic.
 */

const unit = z.number().min(0).max(1)

export const NormalizedRectSchema = z
  .object({ x: unit, y: unit, width: unit.positive(), height: unit.positive() })
  .refine((r) => r.x + r.width <= 1 + 1e-9 && r.y + r.height <= 1 + 1e-9, {
    message: "Field must lie within the page",
  })

// ── Documents ────────────────────────────────────────────────────────────────
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export const CreateUploadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  contentType: z.literal("application/pdf"),
  /** "Prepare document": the READY document (same org) this upload was derived from. */
  sourceDocumentId: z.string().min(1).max(64).optional(),
})
export type CreateUploadInput = z.infer<typeof CreateUploadSchema>

/**
 * An upload still `UPLOADING` after this long was abandoned: the presigned PUT expired long ago
 * and `complete` was never called. The maintenance worker sweeps these.
 */
export const UPLOAD_ABANDON_AFTER_MS = 60 * 60 * 1000

export function abandonedUploadCutoff(now: Date, maxAgeMs = UPLOAD_ABANDON_AFTER_MS): Date {
  return new Date(now.getTime() - maxAgeMs)
}

export const DOCUMENTS_PAGE_SIZE = 25

/** `GET /documents?page=N` (1-based). A page past the end returns no items, not an error. */
export const ListDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
})
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuerySchema>

// ── Envelopes ────────────────────────────────────────────────────────────────
export const RecipientInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email(),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, e.g. +254712345678")
      .optional(),
    role: z.enum(RECIPIENT_ROLES).default("SIGNER"),
    order: z.number().int().min(1).default(1),
    verification: z.enum(VERIFICATION_METHODS).default("LINK"),
  })
  .refine((r) => r.verification !== "SMS_OTP" || Boolean(r.phone), {
    message: "SMS verification needs a phone number",
    path: ["phone"],
  })
export type RecipientInput = z.infer<typeof RecipientInputSchema>

export const CreateEnvelopeSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  message: z.string().max(2000).optional(),
  signingOrder: z.enum(SIGNING_ORDERS).default("PARALLEL"),
  expiresAt: z.coerce.date().optional(),
})
export type CreateEnvelopeInput = z.infer<typeof CreateEnvelopeSchema>

export const FieldInputSchema = z
  .object({
    id: z.string().optional(),
    recipientId: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    page: z.number().int().min(1),
    required: z.boolean().default(true),
    label: z.string().max(120).optional(),
  })
  .and(NormalizedRectSchema)
export type FieldInput = z.infer<typeof FieldInputSchema>

/** PUT /envelopes/:id/fields replaces the full set (editor autosave). */
export const ReplaceFieldsSchema = z.object({ fields: z.array(FieldInputSchema).max(500) })

/** PUT /envelopes/:id/recipients replaces the full list (draft only). */
export const ReplaceRecipientsSchema = z.object({
  recipients: z
    .array(RecipientInputSchema)
    .min(1)
    .max(50)
    .superRefine((list, ctx) => {
      const seen = new Set<string>()
      list.forEach((r, i) => {
        if (seen.has(r.email)) {
          ctx.addIssue({
            code: "custom",
            message: "Each recipient needs a different email",
            path: [i, "email"],
          })
        }
        seen.add(r.email)
      })
    }),
})

export const VoidEnvelopeSchema = z.object({ reason: z.string().trim().min(1).max(500) })

// ── Public signing ───────────────────────────────────────────────────────────
export const VerifyOtpSchema = z.object({ code: z.string().regex(/^\d{6}$/) })

export const FieldValueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    fieldId: z.string(),
    /** data:image/png;base64,... — max ~500 KB */
    dataUrl: z.string().startsWith("data:image/png;base64,").max(700_000),
  }),
  z.object({ kind: z.literal("text"), fieldId: z.string(), value: z.string().max(500) }),
  z.object({ kind: z.literal("checkbox"), fieldId: z.string(), checked: z.boolean() }),
])
export type FieldValueInput = z.infer<typeof FieldValueSchema>

export const SubmitSigningSchema = z.object({
  consent: z.literal(true, { message: "You must agree to sign electronically" }),
  /** CONSENT_VERSION of the text the signer was shown. The API refuses an outdated one. */
  consentVersion: z.string().min(1).max(40),
  values: z.array(FieldValueSchema).max(500),
})
export type SubmitSigningInput = z.infer<typeof SubmitSigningSchema>

export const DeclineSigningSchema = z.object({ reason: z.string().trim().min(1).max(500) })
