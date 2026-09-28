import {
  type RecipientInput,
  type RecipientRole,
  ReplaceRecipientsSchema,
  type SigningOrder,
  type VerificationMethod,
} from "@sahihi/core"
import { type FormErrors, issuesToFormErrors } from "./envelope-form"

/** One editable row. `key` is client-only (stable React key); `id` is set once saved. */
export interface RecipientRow {
  key: string
  id?: string
  name: string
  email: string
  phone: string
  role: RecipientRole
  order: number
  verification: VerificationMethod
}

/** What `GET /envelopes/:id` returns per recipient (the fields the editor needs). */
export interface SavedRecipient {
  id: string
  name: string
  email: string
  phone: string | null
  role: RecipientRole
  order: number
  verification: VerificationMethod
}

export const ROLE_LABELS: Record<RecipientRole, string> = {
  SIGNER: "Needs to sign",
  APPROVER: "Needs to approve",
  VIEWER: "Receives a copy",
}

export const VERIFICATION_LABELS: Record<VerificationMethod, string> = {
  LINK: "Email link only",
  EMAIL_OTP: "Email code",
  SMS_OTP: "SMS code",
}

let keySeq = 0
const newKey = () => `row-${++keySeq}`

export function emptyRow(order: number): RecipientRow {
  return {
    key: newKey(),
    name: "",
    email: "",
    phone: "",
    role: "SIGNER",
    order,
    verification: "LINK",
  }
}

export function rowsFromSaved(saved: SavedRecipient[]): RecipientRow[] {
  return saved.map((r) => ({ ...r, key: r.id, phone: r.phone ?? "" }))
}

/** Order for a newly added row: after the last step. Equal numbers sign in parallel. */
export function nextOrder(rows: RecipientRow[]): number {
  return rows.reduce((max, r) => Math.max(max, r.order), 0) + 1
}

/** Request body for `PUT /envelopes/:id/recipients`. Parallel envelopes send order 1 for everyone. */
export function toPayload(rows: RecipientRow[], signingOrder: SigningOrder) {
  return {
    recipients: rows.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name,
      email: r.email,
      ...(r.phone.trim() ? { phone: r.phone.replace(/[\s-]/g, "") } : {}),
      role: r.role,
      order: signingOrder === "SEQUENTIAL" ? r.order : 1,
      verification: r.verification,
    })),
  }
}

export type ValidateResult =
  | { ok: true; body: { recipients: RecipientInput[] } }
  | { ok: false; errors: FormErrors }

/**
 * Same `ReplaceRecipientsSchema` as the API. Errors are keyed `recipients.<i>.<field>`, which is
 * also the path the API reports, so one mapping serves both.
 */
export function validateRecipients(
  rows: RecipientRow[],
  signingOrder: SigningOrder,
): ValidateResult {
  const parsed = ReplaceRecipientsSchema.safeParse(toPayload(rows, signingOrder))
  if (parsed.success) return { ok: true, body: parsed.data }
  return { ok: false, errors: issuesToFormErrors(parsed.error.issues) }
}
