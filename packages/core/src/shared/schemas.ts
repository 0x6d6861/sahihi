import { z } from "zod"
import { ATTACHMENT_CONTENT_TYPES, MAX_ENVELOPE_DOCUMENTS } from "../envelope/documents"
import { ENVELOPE_STAGES } from "../envelope/stages"
import { DOCUMENT_PERIODS } from "../workspace/folders"
import {
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_ITEM,
  normalizeLabelColor,
  normalizeTagName,
  uniqueTags,
} from "../workspace/labels"
import {
  FIELD_TYPES,
  RECIPIENT_DELIVERIES,
  RECIPIENT_ROLES,
  SIGNING_ORDERS,
  VERIFICATION_METHODS,
} from "./enums"

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

/** A document's display name (upload or rename). */
export const DocumentNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(200, "Use 200 characters or fewer.")

export const CreateUploadSchema = z.object({
  name: DocumentNameSchema,
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  contentType: z.literal("application/pdf"),
  /** "Prepare document": the READY document (same org) this upload was derived from. */
  sourceDocumentId: z.string().min(1).max(64).optional(),
  /** Folder (same org) the document lands in; omitted = workspace root. */
  folderId: z.string().min(1).max(64).optional(),
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

/** Documents list "Status" filter: what a listed document can be (uploads in flight are hidden). */
export const DOCUMENT_LIST_STATUSES = ["READY", "FAILED"] as const

// ── Labels (colour + tags, ADR 0025) ─────────────────────────────────────────
/** A label colour: hex with or without `#`, stored as uppercase `#RRGGBB` (`#RRGGBBAA`). */
export const LabelColorSchema = z.string().transform((v, ctx) => {
  const color = normalizeLabelColor(v)
  if (!color) {
    ctx.addIssue({ code: "custom", message: "Pick a color as hex, like #1570D1." })
    return z.NEVER
  }
  return color
})

export const TagNameSchema = z
  .string()
  .transform(normalizeTagName)
  .pipe(
    z
      .string()
      .min(1, "Enter a tag.")
      .max(MAX_TAG_LENGTH, `Use ${MAX_TAG_LENGTH} characters or fewer.`)
      .refine((n) => !/[,]/.test(n), "A tag can't contain a comma."),
  )

/** A full tag list (replaces the item's tags); case-insensitive repeats collapse to one. */
export const TagListSchema = z
  .array(TagNameSchema)
  .transform((tags) => uniqueTags(tags))
  .pipe(z.array(z.string()).max(MAX_TAGS_PER_ITEM, `Use ${MAX_TAGS_PER_ITEM} tags or fewer.`))

/** Colour (`null` clears it) and/or the full tag list, for a folder or any item in one. */
export const labelFields = {
  color: LabelColorSchema.nullable().optional(),
  tags: TagListSchema.optional(),
}

/**
 * `GET /documents?page=N&folderId=…&q=…&status=…&senderId=…&period=…&tag=…&color=…` (page is
 * 1-based; a page past the end returns no items, not an error). Without `folderId` the list is the
 * workspace root; with `q` it searches names and tags in every folder (ADR 0022, 0025). `tag` is a
 * tag name (matched case-insensitively), `color` a hex (with or without `#`).
 */
export const ListDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  folderId: z.string().min(1).max(64).optional(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(DOCUMENT_LIST_STATUSES).optional(),
  senderId: z.string().min(1).max(64).optional(),
  period: z.enum(DOCUMENT_PERIODS).optional(),
  tag: TagNameSchema.optional(),
  color: LabelColorSchema.optional(),
})
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuerySchema>

/** Rows per page on the Envelopes and Templates lists (ADR 0036). */
export const ENVELOPES_PAGE_SIZE = 25
export const TEMPLATES_PAGE_SIZE = 25

/**
 * The Envelopes list (ADR 0036): `q` matches the title, the document name or a recipient's name or
 * email; `stage` is the Status chip; `senderId` is who created it; `period` uses the same windows
 * as Documents.
 */
export const ListEnvelopesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  /** Like Documents (ADR 0038): omitted = workspace root; `q`, `tag` and `color` search every folder. */
  folderId: z.string().min(1).max(64).optional(),
  q: z.string().trim().max(200).optional(),
  stage: z.enum(ENVELOPE_STAGES).optional(),
  senderId: z.string().min(1).max(64).optional(),
  period: z.enum(DOCUMENT_PERIODS).optional(),
  tag: TagNameSchema.optional(),
  color: LabelColorSchema.optional(),
})
export type ListEnvelopesQuery = z.infer<typeof ListEnvelopesQuerySchema>

/** The Templates list (ADR 0036): `q` matches the name, description or document name. */
export const ListTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  /** Like Documents (ADR 0038): omitted = workspace root; `q`, `tag` and `color` search every folder. */
  folderId: z.string().min(1).max(64).optional(),
  q: z.string().trim().max(200).optional(),
  createdById: z.string().min(1).max(64).optional(),
  period: z.enum(DOCUMENT_PERIODS).optional(),
  tag: TagNameSchema.optional(),
  color: LabelColorSchema.optional(),
})
export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuerySchema>

/**
 * Rename a document, move it into a folder (`folderId: null` = workspace root) and/or change its
 * labels. A rename is refused once a sent envelope uses the document (its name is evidence).
 */
export const UpdateDocumentSchema = z
  .object({
    name: DocumentNameSchema.optional(),
    folderId: z.string().min(1).max(64).nullable().optional(),
    ...labelFields,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change")
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>

// ── Folders ──────────────────────────────────────────────────────────────────
const folderName = z
  .string()
  .trim()
  .min(1, "Enter a folder name.")
  .max(120, "Use 120 characters or fewer.")
  .refine((n) => !/[\\/]/.test(n), "A folder name can't contain / or \\.")

export const CreateFolderSchema = z.object({
  name: folderName,
  /** Parent folder (same org); omitted = workspace root. */
  parentId: z.string().min(1).max(64).optional(),
  ...labelFields,
})
export type CreateFolderInput = z.infer<typeof CreateFolderSchema>

/** Rename, move (`parentId: null` = move to the root) and/or change the labels. */
export const UpdateFolderSchema = z
  .object({
    name: folderName.optional(),
    parentId: z.string().min(1).max(64).nullable().optional(),
    ...labelFields,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change")
export type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>

/**
 * `GET /folders?parentId=…` (omitted = root) or `?all=1` (every folder, for "Move to…"). `q`
 * searches folder names and tags in every folder; `tag` and `color` narrow either view (ADR 0025).
 */
export const ListFoldersQuerySchema = z.object({
  parentId: z.string().min(1).max(64).optional(),
  all: z.enum(["1"]).optional(),
  q: z.string().trim().max(200).optional(),
  tag: TagNameSchema.optional(),
  color: LabelColorSchema.optional(),
})

// ── Envelopes ────────────────────────────────────────────────────────────────
export const RecipientInputSchema = z
  .object({
    id: z.string().optional(),
    name: z
      .string()
      .trim()
      .min(1, "Enter their name.")
      .max(120, "Keep the name under 120 characters."),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, e.g. +254712345678")
      .optional(),
    role: z.enum(RECIPIENT_ROLES).default("SIGNER"),
    order: z.number().int().min(1).default(1),
    verification: z.enum(VERIFICATION_METHODS).default("LINK"),
    delivery: z.enum(RECIPIENT_DELIVERIES).default("EMAIL"),
  })
  .refine((r) => r.verification !== "SMS_OTP" || Boolean(r.phone), {
    message: "SMS verification needs a phone number",
    path: ["phone"],
  })
  // The OTP cookie can't be set inside a third-party iframe; the host app has already
  // authenticated its user (docs/embedded-signing.md).
  .refine((r) => r.delivery !== "EMBEDDED" || r.verification === "LINK", {
    message: "Embedded recipients sign without an extra code (verification must be LINK)",
    path: ["verification"],
  })
export type RecipientInput = z.infer<typeof RecipientInputSchema>

/** Document ids for a new envelope, in signing order (ADR 0037): unique, 1 to 10. */
const DocumentIdsSchema = z
  .array(z.string().min(1).max(64))
  .min(1)
  .max(MAX_ENVELOPE_DOCUMENTS)
  .refine((ids) => new Set(ids).size === ids.length, "Each document can be added once.")

/** An envelope's title (on the signing page, the emails and the certificate). */
export const EnvelopeTitleSchema = z.string().trim().min(1, "Enter a title.").max(200)

/**
 * A new draft. `documentIds` lists the documents to sign in order; `documentId` (one document) is
 * still accepted from older callers and means `documentIds: [documentId]`.
 */
export const CreateEnvelopeSchema = z
  .object({
    documentIds: DocumentIdsSchema.optional(),
    documentId: z.string().min(1).max(64).optional(),
    title: EnvelopeTitleSchema,
    message: z.string().max(2000).optional(),
    signingOrder: z.enum(SIGNING_ORDERS).default("PARALLEL"),
    expiresAt: z.coerce.date().optional(),
    /** Folder (same org) the draft lands in; omitted = workspace root (ADR 0038). */
    folderId: z.string().min(1).max(64).optional(),
  })
  .transform(({ documentId, documentIds, ...rest }, ctx) => {
    const ids = documentIds ?? (documentId ? [documentId] : [])
    if (ids.length === 0) {
      ctx.addIssue({ code: "custom", path: ["documentIds"], message: "Pick a document." })
      return z.NEVER
    }
    return { ...rest, documentIds: ids }
  })
export type CreateEnvelopeInput = z.infer<typeof CreateEnvelopeSchema>

/** Add READY library documents to a draft (`POST /envelopes/:id/documents`), after the current ones. */
export const AddEnvelopeDocumentsSchema = z.object({ documentIds: DocumentIdsSchema })

/** The draft's documents in their new order (`PUT /envelopes/:id/documents/order`): every id once. */
export const ReorderEnvelopeDocumentsSchema = z.object({
  envelopeDocumentIds: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(MAX_ENVELOPE_DOCUMENTS)
    .refine((ids) => new Set(ids).size === ids.length, "Each document can appear once."),
})

/** A supporting file's upload (ADR 0037): an allowed type, at most 25 MB. */
export const CreateAttachmentUploadSchema = z.object({
  name: DocumentNameSchema,
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  contentType: z.enum(ATTACHMENT_CONTENT_TYPES, {
    message: "This file type can't be attached. Use a PDF, image, Office file, CSV or text file.",
  }),
})
export type CreateAttachmentUploadInput = z.infer<typeof CreateAttachmentUploadSchema>

/**
 * Move an envelope to a folder (`folderId: null` = workspace root) and/or set its colour and tags
 * (`PATCH /envelopes/:id/labels`, ADR 0038). Allowed in any status: organisation only, never
 * evidence.
 */
export const UpdateEnvelopeLabelsSchema = z
  .object({
    folderId: z.string().min(1).max(64).nullable().optional(),
    ...labelFields,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change")
export type UpdateEnvelopeLabelsInput = z.infer<typeof UpdateEnvelopeLabelsSchema>

/** A draft's details, edited in the draft editor's "Review & send" (`PUT /envelopes/:id/details`). */
export const UpdateEnvelopeDetailsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().max(2000).optional(),
  signingOrder: z.enum(SIGNING_ORDERS),
  /** null clears the expiry. */
  expiresAt: z.coerce.date().nullable(),
})
export type UpdateEnvelopeDetailsInput = z.infer<typeof UpdateEnvelopeDetailsSchema>

/**
 * Switch one of a draft's documents to another (`PUT /envelopes/:id/document`, after "Prepare
 * document"). `envelopeDocumentId` names which; omitted means the first (older callers).
 */
export const ReplaceEnvelopeDocumentSchema = z.object({
  documentId: z.string().min(1),
  envelopeDocumentId: z.string().min(1).max(64).optional(),
})

export const FieldInputSchema = z
  .object({
    id: z.string().optional(),
    recipientId: z.string().min(1),
    /**
     * The envelope document the field sits on; `page` is 1-based within it (ADR 0037). Omitted
     * means the envelope's first document (callers built before multi-document envelopes).
     */
    envelopeDocumentId: z.string().min(1).max(64).optional(),
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
