import { z } from "zod"
import type { FieldType, RecipientRole, SigningOrder, VerificationMethod } from "../shared/enums"
import { RecipientInputSchema } from "../shared/schemas"

/**
 * Templates (docs/templates.md): a document + recipient roles + a field layout, saved from an
 * envelope and turned back into DRAFT envelopes. Pure logic only; the API does the I/O.
 */

// ── Save an envelope as a template ───────────────────────────────────────────
export const TemplateRoleInputSchema = z.object({
  recipientId: z.string().min(1),
  /** What the slot is called when the template is used ("Tenant", "Landlord"). */
  label: z.string().trim().min(1, "Name this role").max(60),
  /** Keep this recipient's name/email/phone, e.g. the company's own countersigner. */
  keepContact: z.boolean().default(false),
})

export const SaveTemplateSchema = z.object({
  envelopeId: z.string().min(1),
  name: z.string().trim().min(1, "Give the template a name").max(120),
  description: z.string().trim().max(500).optional(),
  roles: z
    .array(TemplateRoleInputSchema)
    .min(1)
    .max(50)
    .superRefine((roles, ctx) => {
      const ids = new Set<string>()
      const labels = new Set<string>()
      roles.forEach((r, i) => {
        if (ids.has(r.recipientId))
          ctx.addIssue({ code: "custom", message: "Duplicate recipient", path: [i, "recipientId"] })
        const label = r.label.toLowerCase()
        if (labels.has(label))
          ctx.addIssue({
            code: "custom",
            message: "Each role needs a different name",
            path: [i, "label"],
          })
        ids.add(r.recipientId)
        labels.add(label)
      })
    }),
})
export type SaveTemplateInput = z.infer<typeof SaveTemplateSchema>

export const UpdateTemplateSchema = z
  .object({
    name: z.string().trim().min(1, "Give the template a name").max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, "Nothing to update")

// ── Use a template ───────────────────────────────────────────────────────────
export const UseTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().max(2000).optional(),
  expiresAt: z.coerce.date().optional(),
  /** One entry per role without a fixed contact. */
  recipients: z
    .array(
      z.object({
        roleId: z.string().min(1),
        name: z.string(),
        email: z.string(),
        phone: z.string().optional(),
        /** EMBEDDED: signs inside your app, no emails (docs/embedded-signing.md) */
        delivery: z.enum(["EMAIL", "EMBEDDED"]).optional(),
      }),
    )
    .max(50),
})
export type UseTemplateInput = z.infer<typeof UseTemplateSchema>

/** Body of `POST /templates/:id/envelopes` from the web: `send: true` sends right away ("Send now"). */
export const UseTemplateRequestSchema = UseTemplateSchema.extend({
  send: z.boolean().default(false),
})

const ROLE_WORD: Record<RecipientRole, string> = {
  SIGNER: "Signer",
  APPROVER: "Approver",
  VIEWER: "Viewer",
}

/** Default role labels for "Save as template": "Signer 1", "Signer 2", "Viewer 1"… */
export function defaultRoleLabels(recipients: { role: RecipientRole }[]): string[] {
  const counts = new Map<RecipientRole, number>()
  return recipients.map((r) => {
    const n = (counts.get(r.role) ?? 0) + 1
    counts.set(r.role, n)
    return `${ROLE_WORD[r.role]} ${n}`
  })
}

export interface EnvelopeRecipientForTemplate {
  id: string
  name: string
  email: string
  phone: string | null
  role: RecipientRole
  order: number
  verification: VerificationMethod
  colorIndex: number
}

export interface TemplateRoleData {
  /** The envelope recipient it came from; only used to re-link fields while saving. */
  recipientId: string
  label: string
  role: RecipientRole
  order: number
  verification: VerificationMethod
  colorIndex: number
  name: string | null
  email: string | null
  phone: string | null
}

/**
 * Roles for a new template. Every recipient of the envelope must be named exactly once (their
 * fields come along), so a template never silently drops a signer.
 */
export function templateRolesFromEnvelope(
  recipients: EnvelopeRecipientForTemplate[],
  roles: SaveTemplateInput["roles"],
): { ok: true; roles: TemplateRoleData[] } | { ok: false; message: string } {
  const byId = new Map(recipients.map((r) => [r.id, r]))
  if (roles.length !== recipients.length || roles.some((r) => !byId.has(r.recipientId))) {
    return { ok: false, message: "Name a role for every recipient of the envelope" }
  }
  return {
    ok: true,
    roles: roles.map((input) => {
      const r = byId.get(input.recipientId) as EnvelopeRecipientForTemplate
      return {
        recipientId: r.id,
        label: input.label,
        role: r.role,
        order: r.order,
        verification: r.verification,
        colorIndex: r.colorIndex,
        name: input.keepContact ? r.name : null,
        email: input.keepContact ? r.email : null,
        phone: input.keepContact ? r.phone : null,
      }
    }),
  }
}

// ── Template → draft envelope ───────────────────────────────────────────────
export interface TemplateForUse {
  signingOrder: SigningOrder
  roles: {
    id: string
    label: string
    role: RecipientRole
    order: number
    verification: VerificationMethod
    colorIndex: number
    name: string | null
    email: string | null
    phone: string | null
  }[]
  fields: {
    roleId: string
    type: FieldType
    page: number
    x: number
    y: number
    width: number
    height: number
    required: boolean
    label: string | null
  }[]
}

export interface DraftRecipient {
  roleId: string
  delivery: "EMAIL" | "EMBEDDED"
  name: string
  email: string
  phone: string | null
  role: RecipientRole
  order: number
  verification: VerificationMethod
  colorIndex: number
}

export type TemplateIssue = { path: string; message: string }

/** Plain-language messages for the per-person inputs (zod's defaults are for developers). */
const FRIENDLY: Record<string, string> = {
  name: "Enter their name",
  email: "Enter a valid email address",
}

/** True when the role is always sent to the same person (no input needed). */
export const hasFixedContact = (role: { name: string | null; email: string | null }) =>
  Boolean(role.name && role.email)

/**
 * Fills every role with a person (the input, or the role's fixed contact) and validates them
 * like any recipient list: same schema, unique emails, a phone for SMS verification. Issues use
 * the path `recipients.<roleId>.<field>` so the form can show them next to the right input.
 */
export function draftFromTemplate<T extends TemplateForUse>(
  template: T,
  input: UseTemplateInput["recipients"],
):
  | { ok: true; recipients: DraftRecipient[]; fields: T["fields"] }
  | { ok: false; issues: TemplateIssue[] } {
  const issues: TemplateIssue[] = []
  const given = new Map(input.map((r) => [r.roleId, r]))
  for (const roleId of given.keys()) {
    if (!template.roles.some((r) => r.id === roleId))
      issues.push({ path: `recipients.${roleId}`, message: "Unknown role" })
  }

  const recipients: DraftRecipient[] = []
  const seen = new Map<string, string>()
  for (const role of template.roles) {
    const path = `recipients.${role.id}`
    const person = hasFixedContact(role)
      ? {
          name: role.name ?? "",
          email: role.email ?? "",
          phone: role.phone ?? undefined,
          delivery: undefined,
        }
      : given.get(role.id)
    if (!person) {
      issues.push({ path, message: `Who is the ${role.label}?` })
      continue
    }
    const parsed = RecipientInputSchema.safeParse({
      name: person.name,
      email: person.email,
      phone: person.phone || undefined,
      role: role.role,
      order: role.order,
      verification: role.verification,
      delivery: person.delivery,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".")
        issues.push({ path: `${path}.${key}`, message: FRIENDLY[key] ?? issue.message })
      }
      continue
    }
    const other = seen.get(parsed.data.email)
    if (other) {
      issues.push({
        path: `${path}.email`,
        message: `Already used for ${other}; each recipient needs a different email`,
      })
      continue
    }
    seen.set(parsed.data.email, role.label)
    recipients.push({
      roleId: role.id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      role: role.role,
      order: template.signingOrder === "SEQUENTIAL" ? role.order : 1,
      verification: role.verification,
      colorIndex: role.colorIndex,
      delivery: parsed.data.delivery,
    })
  }
  if (issues.length > 0) return { ok: false, issues }
  // Viewers never own fields (same rule as the recipients editor).
  const viewerRoles = new Set(template.roles.filter((r) => r.role === "VIEWER").map((r) => r.id))
  return { ok: true, recipients, fields: template.fields.filter((f) => !viewerRoles.has(f.roleId)) }
}
