import { z } from "zod"
import { referencedVariableKeys } from "./document"
import { type GeneratedDocumentData, SignerRoleSchema, VariableSchema } from "./model"

/**
 * Workspace templates for generated documents (docs/ai-documents.md → Templates): a document's
 * wording, blanks and signers, saved to start new documents from. Values and contacts are cleared
 * unless the person chose to keep them (a company's own name and signatory, say).
 */

export const SaveGenerationTemplateSchema = z.object({
  versionId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
  /** Blanks whose value the template keeps. */
  keepValues: z.array(VariableSchema.shape.key).max(100).default([]),
  /** Roles whose name and email the template keeps. */
  keepContacts: z.array(SignerRoleSchema.shape.key).max(20).default([]),
})
export type SaveGenerationTemplateInput = z.infer<typeof SaveGenerationTemplateSchema>

export class TemplateKeepError extends Error {}

/**
 * The template's data: the same text and signers, blanks the text no longer uses dropped, and
 * every value and contact cleared except the ones kept. A kept value counts as answered (source
 * `template`). Throws `TemplateKeepError` when asked to keep a value or contact that isn't there.
 */
export function templateDataFrom(
  data: GeneratedDocumentData,
  keep: { keepValues: readonly string[]; keepContacts: readonly string[] },
): GeneratedDocumentData {
  const used = new Set(referencedVariableKeys(data.content))
  for (const key of keep.keepValues) {
    const v = data.variables.find((x) => x.key === key)
    if (!v || v.value === null || !used.has(key)) {
      throw new TemplateKeepError(`There's no value to keep for "${key}"`)
    }
  }
  for (const key of keep.keepContacts) {
    const r = data.roles.find((x) => x.key === key)
    if (!r || (r.name === null && r.email === null)) {
      throw new TemplateKeepError(`There's no contact to keep for "${key}"`)
    }
  }
  const values = new Set(keep.keepValues)
  const contacts = new Set(keep.keepContacts)
  const copy = structuredClone(data)
  return {
    ...copy,
    variables: copy.variables
      .filter((v) => used.has(v.key))
      .map(({ source: _source, ...v }) =>
        values.has(v.key)
          ? { ...v, status: "answered" as const, source: "template" as const }
          : { ...v, value: null, status: "unresolved" as const },
      ),
    roles: copy.roles.map((r) => (contacts.has(r.key) ? r : { ...r, name: null, email: null })),
  }
}
