import {
  type CreateEnvelopeInput,
  CreateEnvelopeSchema,
  type SigningOrder,
  type UpdateEnvelopeDetailsInput,
  UpdateEnvelopeDetailsSchema,
} from "@sahihi/core"

/** Raw values from the new-envelope form. */
export interface NewEnvelopeValues {
  documentId: string
  title: string
  message: string
  sequential: boolean
  /** Calendar day picked in the browser's time zone, or null for no expiry. */
  expiresOn: Date | null
}

/** The "Review & send" dialog's values. */
export interface EnvelopeDetails {
  title: string
  message: string
  sequential: boolean
  /** Calendar day picked in the browser's time zone, or null for no expiry. */
  expiresOn: Date | null
}

/** Form errors keyed by the input `name`, the shape Base UI `Form errors` expects. */
export type FormErrors = Record<string, string>

export type BuildResult =
  | { ok: true; input: CreateEnvelopeInput }
  | { ok: false; errors: FormErrors }

/** An envelope "expiring on" a day stays signable until the end of that day, local time. */
export function expiryFromDate(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999)
}

/** First error per field from zod-style or API `issues[]` (path as array or dotted string). */
export function issuesToFormErrors(
  issues: readonly { path: string | readonly PropertyKey[]; message: string }[],
): FormErrors {
  const errors: FormErrors = {}
  for (const issue of issues) {
    const key =
      typeof issue.path === "string" ? issue.path : issue.path.map((p) => String(p)).join(".")
    const field = key || "form"
    errors[field] ??= issue.message
  }
  return errors
}

const MESSAGES: Record<string, string> = {
  documentId: "Choose a document.",
  title: "Give the envelope a title (up to 200 characters).",
  message: "Keep the message under 2,000 characters.",
}

/** Validates with the same `CreateEnvelopeSchema` the API uses, plus "expiry is in the future". */
export function buildCreateEnvelopeInput(values: NewEnvelopeValues, now = new Date()): BuildResult {
  const expiresAt = values.expiresOn ? expiryFromDate(values.expiresOn) : undefined
  const message = values.message.trim()
  const parsed = CreateEnvelopeSchema.safeParse({
    documentId: values.documentId,
    title: values.title,
    message: message || undefined,
    signingOrder: values.sequential ? "SEQUENTIAL" : "PARALLEL",
    expiresAt,
  })

  const errors: FormErrors = parsed.success
    ? {}
    : Object.fromEntries(
        Object.entries(issuesToFormErrors(parsed.error.issues)).map(([k, v]) => [
          k,
          MESSAGES[k] ?? v,
        ]),
      )
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    errors.expiresAt = "Pick a date in the future."
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, input: parsed.data }
}

/** A saved envelope's details as dialog values; the expiry becomes its local calendar day. */
export function detailsFromEnvelope(e: {
  title: string
  message: string | null
  signingOrder: SigningOrder
  expiresAt: string | null
}): EnvelopeDetails {
  const at = e.expiresAt ? new Date(e.expiresAt) : null
  return {
    title: e.title,
    message: e.message ?? "",
    sequential: e.signingOrder === "SEQUENTIAL",
    expiresOn: at ? new Date(at.getFullYear(), at.getMonth(), at.getDate()) : null,
  }
}

export type DetailsResult =
  | { ok: true; input: UpdateEnvelopeDetailsInput }
  | { ok: false; errors: FormErrors }

/** Validates with the `UpdateEnvelopeDetailsSchema` of `PUT /envelopes/:id/details`. */
export function buildEnvelopeDetailsInput(
  values: EnvelopeDetails,
  now = new Date(),
): DetailsResult {
  const expiresAt = values.expiresOn ? expiryFromDate(values.expiresOn) : null
  const message = values.message.trim()
  const parsed = UpdateEnvelopeDetailsSchema.safeParse({
    title: values.title,
    message: message || undefined,
    signingOrder: values.sequential ? "SEQUENTIAL" : "PARALLEL",
    expiresAt,
  })
  const errors: FormErrors = parsed.success
    ? {}
    : Object.fromEntries(
        Object.entries(issuesToFormErrors(parsed.error.issues)).map(([k, v]) => [
          k,
          MESSAGES[k] ?? v,
        ]),
      )
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    errors.expiresAt = "Pick a date in the future."
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, input: parsed.data }
}
