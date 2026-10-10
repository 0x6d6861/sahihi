import { z } from "zod"
import {
  type BlockNode,
  type FieldNode,
  GENERATED_FIELD_TYPES,
  type GeneratedDocumentData,
  type InlineNode,
  type Section,
  type SignatureBlock,
  type SignerRole,
  SignerRoleSchema,
} from "./model"
import { rolePartyKeys } from "./parties"

/**
 * Who signs a generated document and where (docs/ai-documents.md → Signers): the roles with their
 * contacts, and each role's fields. Fields live in signature blocks in the text; this is the one
 * place that turns a definition into roles plus blocks, used by the Signers tab and by the
 * assistant's `define_signers` proposals.
 */

/** Initials boxes fit side by side in a page's bottom margin up to this many signers. */
export const MAX_PAGE_INITIALS = 5

export const SignerFieldSchema = z.object({
  /** Kept when the field already exists, so it stays the same field across versions. */
  id: z.string().max(64).optional(),
  fieldType: z.enum(GENERATED_FIELD_TYPES),
  label: z.string().trim().max(80).optional(),
  required: z.boolean().default(true),
})
export type SignerField = z.infer<typeof SignerFieldSchema>

export const SignersDefinitionSchema = z.object({
  roles: z.array(SignerRoleSchema).min(1).max(20),
  /** Fields by role key, in the order they appear. Viewers have none. */
  fields: z.record(z.string(), z.array(SignerFieldSchema).max(12)).default({}),
  /**
   * Role key → the party blank it signs for (ADR 0048). Read from the signature blocks' captions;
   * on save it only captions a new role's block ("For {party}"). Existing captions stay as written.
   */
  parties: z.record(z.string(), z.string().max(64)).default({}),
})
export type SignersDefinition = z.infer<typeof SignersDefinitionSchema>

function signatureBlocks(data: GeneratedDocumentData): SignatureBlock[] {
  return data.content.content.flatMap((s) =>
    s.content.filter((b): b is SignatureBlock => b.type === "signatureBlock"),
  )
}

/** The document's signers as a definition: its roles and every role's fields. */
export function currentSigners(data: GeneratedDocumentData): SignersDefinition {
  const fields: Record<string, SignerField[]> = {}
  for (const role of data.roles) fields[role.key] = []
  for (const block of signatureBlocks(data)) {
    const list = fields[block.attrs.roleKey] ?? []
    for (const c of block.content) {
      if (c.type === "field") {
        list.push({
          id: c.attrs.id,
          fieldType: c.attrs.fieldType,
          ...(c.attrs.label ? { label: c.attrs.label } : {}),
          required: c.attrs.required,
        })
      }
    }
    fields[block.attrs.roleKey] = list
  }
  const links = rolePartyKeys(data)
  const parties: Record<string, string> = {}
  for (const role of data.roles) {
    const key = links[role.key]
    if (key) parties[role.key] = key
  }
  return { roles: data.roles, fields, parties }
}

export class SignersError extends Error {}

/**
 * Applies a definition: roles replace the document's roles; each role's fields become its
 * signature block (the first one, caption kept; any others are merged into it). A role without
 * fields loses its block; a new role with fields gets a "For <party>" block (its party blank, or
 * else its label) in the section that holds the other blocks, or a new "Signatures" section at the
 * end. Throws `SignersError` for a
 * definition that can't be applied (duplicate keys, fields for unknown roles or viewers).
 */
export function applySigners(
  data: GeneratedDocumentData,
  def: SignersDefinition,
  newId: () => string,
): GeneratedDocumentData {
  const keys = new Set<string>()
  for (const r of def.roles) {
    if (keys.has(r.key)) throw new SignersError(`Two signers use the key "${r.key}"`)
    keys.add(r.key)
  }
  const roles = new Map(def.roles.map((r) => [r.key, r]))
  for (const [key, fields] of Object.entries(def.fields)) {
    if (!fields.length) continue
    const role = roles.get(key)
    if (!role) throw new SignersError(`Fields for an unknown signer "${key}"`)
    if (role.recipientRole === "VIEWER") {
      throw new SignersError(`${role.label} gets a copy and can't have fields`)
    }
  }

  const variables = new Set(data.variables.map((v) => v.key))
  for (const [roleKey, key] of Object.entries(def.parties)) {
    if (roles.has(roleKey) && !variables.has(key)) {
      throw new SignersError(`There is no blank "${key}" for ${roles.get(roleKey)?.label}`)
    }
  }

  const usedIds = new Set<string>()
  const toNode = (f: SignerField): FieldNode => {
    const id = f.id && !usedIds.has(f.id) ? f.id : newId()
    usedIds.add(id)
    return {
      type: "field",
      attrs: {
        id,
        fieldType: f.fieldType,
        required: f.required,
        ...(f.label ? { label: f.label } : {}),
      },
    }
  }

  // Walk the text: keep each role's first block (with its new fields), drop the rest.
  const placed = new Set<string>()
  let blockSection: string | null = null
  const sections: Section[] = data.content.content.map((s) => {
    const content: BlockNode[] = []
    for (const b of s.content) {
      if (b.type !== "signatureBlock") {
        content.push(b)
        continue
      }
      blockSection ??= s.attrs.id
      const key = b.attrs.roleKey
      const fields = roles.has(key) ? (def.fields[key] ?? []) : []
      if (placed.has(key) || fields.length === 0) continue
      placed.add(key)
      const captions = b.content.filter((c) => c.type === "paragraph")
      content.push({ ...b, content: [...captions, ...fields.map(toNode)] })
    }
    return { ...s, content }
  })

  // New blocks for roles that have fields but no block yet.
  const fresh: BlockNode[] = def.roles
    .filter((r) => !placed.has(r.key) && (def.fields[r.key] ?? []).length > 0)
    .map((r) => ({
      type: "signatureBlock",
      attrs: { roleKey: r.key },
      content: [
        {
          type: "paragraph",
          content: caption(r.label, def.parties[r.key]),
        },
        ...(def.fields[r.key] ?? []).map(toNode),
      ],
    }))
  if (fresh.length) {
    const target = sections.find((s) => s.attrs.id === blockSection)
    if (target) target.content.push(...fresh)
    else {
      sections.push({
        type: "section",
        attrs: { id: newId(), title: "Signatures", numbered: true },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Each party signs this document below." }],
          },
          ...fresh,
        ],
      })
    }
  }

  return {
    ...data,
    roles: def.roles.map((r) => ({
      ...r,
      initialsOnEveryPage: r.recipientRole === "SIGNER" && r.initialsOnEveryPage,
    })),
    content: { ...data.content, content: sections },
  }
}

/** "For {party}" when the role signs for a party blank, else "For <label>". */
function caption(label: string, partyKey: string | undefined): InlineNode[] {
  if (!partyKey) return [{ type: "text", text: `For ${label}` }]
  return [
    { type: "text", text: "For " },
    { type: "variable", attrs: { key: partyKey }, marks: [{ type: "bold" }] },
  ]
}

const FIELD_NAMES: Record<SignerField["fieldType"], string> = {
  SIGNATURE: "signature",
  INITIALS: "initials",
  NAME: "full name",
  DATE_SIGNED: "date signed",
  TEXT: "text",
  CHECKBOX: "checkbox",
}

/** The signers as text, one line per role, for proposal diffs and the assistant's prompt. */
export function signersText(def: SignersDefinition): string {
  return def.roles
    .map((r: SignerRole) => {
      const kind = r.recipientRole === "SIGNER" ? "signs" : "gets a copy"
      const extra = r.initialsOnEveryPage ? ", initials every page" : ""
      const fields = (def.fields[r.key] ?? [])
        .map((f) =>
          f.label ? `${FIELD_NAMES[f.fieldType]} "${f.label}"` : FIELD_NAMES[f.fieldType],
        )
        .join(", ")
      return `${r.label} (${kind}${extra}): ${fields || "no fields"}`
    })
    .join("\n")
}
