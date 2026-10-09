import type {
  BlockNode,
  DocContent,
  FieldNode,
  GeneratedDocumentData,
  InlineNode,
  Section,
  SignerRole,
  ValueSource,
  Variable,
} from "./model"

/** 1, 2, 3… in order, skipping unnumbered sections (they map to null). */
export function numberSections(content: DocContent): Map<string, number | null> {
  const numbers = new Map<string, number | null>()
  let n = 0
  for (const s of content.content) numbers.set(s.attrs.id, s.attrs.numbered ? ++n : null)
  return numbers
}

function inlineNodes(block: BlockNode): InlineNode[] {
  switch (block.type) {
    case "paragraph":
      return block.content
    case "bulletList":
    case "orderedList":
      return block.content.flatMap((item) => item.content[0].content)
    case "table":
      return block.content.flatMap((row) =>
        row.content.flatMap((cell) => cell.content.flatMap((p) => p.content)),
      )
    case "signatureBlock":
      return block.content.flatMap((c) => (c.type === "paragraph" ? c.content : []))
  }
}

/** Every variable key the text refers to, in reading order, without repeats. */
export function referencedVariableKeys(content: DocContent): string[] {
  const keys = new Set<string>()
  for (const s of content.content) {
    for (const b of s.content) {
      for (const n of inlineNodes(b)) if (n.type === "variable") keys.add(n.attrs.key)
    }
  }
  return [...keys]
}

export interface PlacedFieldNode {
  roleKey: string
  sectionId: string
  field: FieldNode["attrs"]
}

/** Every field in reading order, with the role whose signature block holds it. */
export function documentFields(content: DocContent): PlacedFieldNode[] {
  const out: PlacedFieldNode[] = []
  for (const s of content.content) {
    for (const b of s.content) {
      if (b.type !== "signatureBlock") continue
      for (const c of b.content) {
        if (c.type === "field") {
          out.push({ roleKey: b.attrs.roleKey, sectionId: s.attrs.id, field: c.attrs })
        }
      }
    }
  }
  return out
}

export type StructureIssue =
  | { code: "unknown_variable"; key: string }
  | { code: "unknown_role"; roleKey: string }
  | { code: "viewer_has_fields"; roleKey: string }
  | { code: "duplicate_id"; id: string }
  | { code: "duplicate_key"; key: string }
  | { code: "ragged_table"; sectionId: string }

/**
 * References the zod schema can't check: every variable node and signature block points at
 * something declared, ids and keys are unique, and viewers own no fields.
 */
export function structureIssues(data: GeneratedDocumentData): StructureIssue[] {
  const issues: StructureIssue[] = []
  const variableKeys = new Set<string>()
  for (const v of data.variables) {
    if (variableKeys.has(v.key)) issues.push({ code: "duplicate_key", key: v.key })
    variableKeys.add(v.key)
  }
  const roles = new Map<string, SignerRole>()
  for (const r of data.roles) {
    if (roles.has(r.key)) issues.push({ code: "duplicate_key", key: r.key })
    roles.set(r.key, r)
  }
  for (const key of referencedVariableKeys(data.content)) {
    if (!variableKeys.has(key)) issues.push({ code: "unknown_variable", key })
  }
  const ids = new Set<string>()
  const seeId = (id: string) => {
    if (ids.has(id)) issues.push({ code: "duplicate_id", id })
    ids.add(id)
  }
  for (const s of data.content.content) {
    seeId(s.attrs.id)
    for (const b of s.content) {
      if (b.type !== "table") continue
      const widths = new Set(b.content.map((row) => row.content.length))
      if (widths.size > 1) issues.push({ code: "ragged_table", sectionId: s.attrs.id })
    }
  }
  const reported = new Set<string>()
  for (const f of documentFields(data.content)) {
    seeId(f.field.id)
    const role = roles.get(f.roleKey)
    if (reported.has(f.roleKey)) continue
    if (!role) {
      issues.push({ code: "unknown_role", roleKey: f.roleKey })
      reported.add(f.roleKey)
    } else if (role.recipientRole === "VIEWER") {
      issues.push({ code: "viewer_has_fields", roleKey: f.roleKey })
      reported.add(f.roleKey)
    }
  }
  return issues
}

/** Plain text of inline nodes. Unresolved variables read as `[Label]`. */
export function inlineText(nodes: InlineNode[], variables: Variable[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return n.text
      const v = variables.find((x) => x.key === n.attrs.key)
      return v?.value ?? `[${v?.label ?? n.attrs.key}]`
    })
    .join("")
}

/**
 * A section as compact text for the assistant: variables appear as `{{key}}` so it can tell
 * blanks from wording, and fields as `<SIGNATURE field for role>`.
 */
export function sectionForPrompt(section: Section, number: number | null): string {
  const tokens = (nodes: InlineNode[]) =>
    nodes.map((n) => (n.type === "text" ? n.text : `{{${n.attrs.key}}}`)).join("")
  const lines = [`${number ? `${number}. ` : ""}${section.attrs.title} [id=${section.attrs.id}]`]
  for (const b of section.content) {
    if (b.type === "paragraph") lines.push(tokens(b.content))
    else if (b.type === "signatureBlock") {
      for (const c of b.content) {
        lines.push(
          c.type === "paragraph"
            ? tokens(c.content)
            : `<${c.attrs.fieldType} field for role ${b.attrs.roleKey}>`,
        )
      }
    } else if (b.type === "table") {
      for (const row of b.content) {
        const cells = row.content.map((c) => c.content.map((p) => tokens(p.content)).join(" "))
        lines.push(`| ${cells.join(" | ")} |`)
      }
    } else {
      b.content.forEach((item, i) => {
        const bullet = b.type === "orderedList" ? `(${String.fromCharCode(97 + (i % 26))})` : "-"
        lines.push(`  ${bullet} ${tokens(item.content[0].content)}`)
      })
    }
  }
  return lines.join("\n")
}

export interface VariableUpdate {
  key: string
  /** null = the person skipped the question; the blank stays visibly unresolved. */
  value: string | null
}

/**
 * Applies values (or skips) to a copy of the data. Unknown keys are refused rather than ignored,
 * so a caller can't believe it filled a blank it didn't.
 */
export function applyVariableUpdates(
  data: GeneratedDocumentData,
  updates: VariableUpdate[],
  source: ValueSource,
): GeneratedDocumentData {
  const byKey = new Map(updates.map((u) => [u.key, u]))
  for (const key of byKey.keys()) {
    if (!data.variables.some((v) => v.key === key)) throw new Error(`Unknown variable "${key}"`)
  }
  return {
    ...data,
    variables: data.variables.map((v) => {
      const u = byKey.get(v.key)
      if (!u) return v
      if (u.value === null) {
        // Skipping a blank that already has a value would silently drop it; keep the value.
        return v.value === null ? { ...v, status: "skipped", source: undefined } : v
      }
      return { ...v, value: u.value, status: "answered", source }
    }),
  }
}

export interface RoleContact {
  key: string
  name: string | null
  email: string | null
}

/** Sets signer contacts by role key; keys and labels stay as the template defined them. */
export function applyRoleContacts(
  data: GeneratedDocumentData,
  contacts: RoleContact[],
): GeneratedDocumentData {
  const byKey = new Map(contacts.map((c) => [c.key, c]))
  for (const key of byKey.keys()) {
    if (!data.roles.some((r) => r.key === key)) throw new Error(`Unknown role "${key}"`)
  }
  return {
    ...data,
    roles: data.roles.map((r) => {
      const c = byKey.get(r.key)
      if (!c) return r
      return { ...r, name: c.name || null, email: c.email ? c.email.trim().toLowerCase() : null }
    }),
  }
}
