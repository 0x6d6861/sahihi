import { z } from "zod"
import { FIELD_TYPES, SIGNING_ORDERS } from "../shared/enums"
import { NormalizedRectSchema, ReplaceRecipientsSchema } from "../shared/schemas"

/**
 * Request bodies of the public API (`/api/v1`, docs/public-api.md). Envelopes are created in one
 * call, either from a template (fill its roles) or from an uploaded document (recipients +
 * fields, fields pointing at recipients by position).
 */

export const ApiFieldSchema = z
  .object({
    /** 0-based index into `recipients` */
    recipient: z.number().int().min(0),
    type: z.enum(FIELD_TYPES),
    page: z.number().int().min(1),
    required: z.boolean().default(true),
    label: z.string().max(120).optional(),
  })
  .and(NormalizedRectSchema)
export type ApiFieldInput = z.infer<typeof ApiFieldSchema>

const common = {
  title: z.string().trim().min(1).max(200),
  message: z.string().max(2000).optional(),
  expiresAt: z.coerce.date().optional(),
  /** Send right away (default: leave as a draft). */
  send: z.boolean().default(false),
}

export const ApiCreateFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  recipients: z
    .array(
      z.object({
        roleId: z.string().min(1),
        name: z.string(),
        email: z.string(),
        phone: z.string().optional(),
      }),
    )
    .max(50),
  ...common,
})

export const ApiCreateFromDocumentSchema = z
  .object({
    documentId: z.string().min(1),
    signingOrder: z.enum(SIGNING_ORDERS).default("PARALLEL"),
    recipients: ReplaceRecipientsSchema.shape.recipients,
    fields: z.array(ApiFieldSchema).max(500),
    ...common,
  })
  .superRefine((v, ctx) => {
    v.fields.forEach((f, i) => {
      const r = v.recipients[f.recipient]
      if (!r) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "recipient"],
          message: "No such recipient",
        })
      } else if (r.role === "VIEWER") {
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "recipient"],
          message: "Viewers can't own fields",
        })
      }
    })
  })

export const ApiCreateEnvelopeSchema = z.union([
  ApiCreateFromTemplateSchema,
  ApiCreateFromDocumentSchema,
])
export type ApiCreateEnvelopeInput = z.infer<typeof ApiCreateEnvelopeSchema>
export type ApiCreateFromDocumentInput = z.infer<typeof ApiCreateFromDocumentSchema>

/**
 * Answer of the web's create-and-send routes ("Send now" on a template). The envelope
 * always exists once this is returned; `sent: false` with `error` means it stayed a DRAFT because
 * sending was refused (preflight, plan quota), and the sender finishes it on the draft page.
 */
export type CreateAndSendResult =
  | { envelope: { id: string }; sent: true }
  | {
      envelope: { id: string }
      sent: false
      error?: string
      message?: string
      issues?: { code: string; message: string; recipientId?: string }[]
    }

export const ApiVoidSchema = z.object({ reason: z.string().trim().min(1).max(500) })

export const ApiListEnvelopesQuerySchema = z.object({
  status: z
    .enum(["DRAFT", "SENT", "IN_PROGRESS", "COMPLETED", "DECLINED", "VOIDED", "EXPIRED"])
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
})
