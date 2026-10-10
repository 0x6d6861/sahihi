import type { GeneratedDocumentData, SignatureBlock, Variable } from "./model"

/**
 * The parties to a generated document (ADR 0048): blanks flagged `party`, plus any blank a signature
 * block's caption names ("For {party_a_name}"), so documents from before the flag still work. A
 * party is linked to the signer whose block names it; the link lives in the text, not in a field.
 */
export interface DocumentParty {
  variableKey: string
  /** The blank's label ("Third party's name"). */
  label: string
  value: string | null
  /** The role whose signature block names this party, if any. */
  roleKey: string | null
  /** A label for a signer of this party ("Third party"). */
  roleLabel: string
}

function signatureBlocks(data: GeneratedDocumentData): SignatureBlock[] {
  return data.content.content.flatMap((s) =>
    s.content.filter((b): b is SignatureBlock => b.type === "signatureBlock"),
  )
}

function captionKeys(block: SignatureBlock): string[] {
  return block.content.flatMap((c) =>
    c.type === "paragraph"
      ? c.content.flatMap((n) => (n.type === "variable" ? [n.attrs.key] : []))
      : [],
  )
}

/**
 * Role key → the party blank its signature block names: the first flagged party in the caption, or
 * else the caption's first blank. Only the role's first block counts, as in `applySigners`.
 */
export function rolePartyKeys(data: GeneratedDocumentData): Record<string, string> {
  const byKey = new Map(data.variables.map((v) => [v.key, v]))
  const out: Record<string, string> = {}
  for (const block of signatureBlocks(data)) {
    const role = block.attrs.roleKey
    if (role in out) continue
    const keys = captionKeys(block).filter((k) => byKey.has(k))
    const key = keys.find((k) => byKey.get(k)?.party) ?? keys[0]
    if (key) out[role] = key
  }
  return out
}

/** "Third party's name" → "Third party"; "Client name" → "Client". */
export function partyRoleLabel(variable: Pick<Variable, "label">): string {
  const label = variable.label.replace(/(?:['’]s)?\s+name$/i, "").trim()
  return label || variable.label
}

/** Every party in the order its blank was declared, with the signer linked to it. */
export function documentParties(data: GeneratedDocumentData): DocumentParty[] {
  const links = rolePartyKeys(data)
  const roleByParty = new Map<string, string>()
  for (const [role, key] of Object.entries(links)) {
    if (!roleByParty.has(key) && data.roles.some((r) => r.key === role)) {
      roleByParty.set(key, role)
    }
  }
  return data.variables
    .filter((v) => v.party || roleByParty.has(v.key))
    .map((v) => ({
      variableKey: v.key,
      label: v.label,
      value: v.value,
      roleKey: roleByParty.get(v.key) ?? null,
      roleLabel: partyRoleLabel(v),
    }))
}
