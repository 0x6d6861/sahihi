import { RecipientInputSchema } from "../shared/schemas"
import { documentFields, referencedVariableKeys, structureIssues } from "./document"
import type { GeneratedDocumentData } from "./model"
import { MAX_PAGE_INITIALS } from "./signers"

/**
 * Checks before a generated document can be finalised into a PDF and a DRAFT envelope
 * (docs/ai-documents.md → Finalise). Returns EVERY problem, like `sendPreflight`, so the person can
 * fix them in one go. The API refuses to finalise while any remain.
 */

export type GenerationPreflightCode =
  | "unresolved_variable"
  | "invalid_structure"
  | "no_signers"
  | "missing_signature_field"
  | "missing_name"
  | "invalid_email"
  | "duplicate_email"
  | "too_many_initials"

export interface GenerationPreflightIssue {
  code: GenerationPreflightCode
  message: string
  variableKey?: string
  roleKey?: string
}

const nameSchema = RecipientInputSchema.shape.name
const emailSchema = RecipientInputSchema.shape.email

export function generationPreflight(data: GeneratedDocumentData): GenerationPreflightIssue[] {
  const issues: GenerationPreflightIssue[] = []
  for (const s of structureIssues(data)) {
    issues.push({ code: "invalid_structure", message: `Document structure: ${s.code}` })
  }

  // Only blanks the text actually uses block finalising; a declared but unused one doesn't.
  const used = new Set(referencedVariableKeys(data.content))
  for (const v of data.variables) {
    if (used.has(v.key) && v.value === null) {
      issues.push({
        code: "unresolved_variable",
        message:
          v.status === "skipped"
            ? `"${v.label}" was skipped. Fill it in.`
            : `Fill in "${v.label}".`,
        variableKey: v.key,
      })
    }
  }

  const signers = data.roles.filter((r) => r.recipientRole === "SIGNER")
  if (signers.length === 0) {
    issues.push({ code: "no_signers", message: "Add at least one signer." })
  }
  const initialling = signers.filter((r) => r.initialsOnEveryPage).length
  if (initialling > MAX_PAGE_INITIALS) {
    issues.push({
      code: "too_many_initials",
      message: `At most ${MAX_PAGE_INITIALS} signers can initial every page.`,
    })
  }
  const fields = documentFields(data.content)
  const seenEmails = new Map<string, string>()
  for (const r of data.roles) {
    if (
      r.recipientRole === "SIGNER" &&
      !fields.some((f) => f.roleKey === r.key && f.field.fieldType === "SIGNATURE")
    ) {
      issues.push({
        code: "missing_signature_field",
        message: `${r.label} needs a signature field.`,
        roleKey: r.key,
      })
    }
    if (!nameSchema.safeParse(r.name ?? "").success) {
      issues.push({ code: "missing_name", message: `Enter ${r.label}'s name.`, roleKey: r.key })
    }
    const email = emailSchema.safeParse(r.email ?? "")
    if (!email.success) {
      issues.push({
        code: "invalid_email",
        message: `Enter a valid email address for ${r.label}.`,
        roleKey: r.key,
      })
    } else {
      const other = seenEmails.get(email.data)
      if (other) {
        issues.push({
          code: "duplicate_email",
          message: `Same email as ${other}. Each signer needs their own.`,
          roleKey: r.key,
        })
      } else seenEmails.set(email.data, r.label)
    }
  }
  return issues
}
