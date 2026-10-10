import {
  currentSigners,
  documentParties,
  type GeneratedDocumentData,
  MAX_QUESTIONS_PER_BATCH,
  numberSections,
  referencedVariableKeys,
  sectionForPrompt,
} from "@sahihi/core"

/**
 * The assistant's instructions (docs/ai-documents.md → Assistant). Built on the server from the
 * latest version every turn: the browser never supplies the document text or the instructions, so
 * a forged request can't change what the assistant believes the document says.
 */
export function systemPrompt(input: {
  data: GeneratedDocumentData
  versionId: string
  /** The section the person attached to their message, if any. */
  selectedSectionId: string | null
  organizationName: string
  today: string
  /** Recent proposals, newest first, so the assistant knows what was accepted or rejected. */
  proposals?: { id: string; sectionId: string | null; status: string; rationale: string }[]
}): string {
  const { data } = input
  const used = new Set(referencedVariableKeys(data.content))
  const numbers = numberSections(data.content)
  const blanks = data.variables
    .filter((v) => used.has(v.key))
    .map((v) => {
      const state =
        v.value !== null
          ? `filled: ${JSON.stringify(v.value)}`
          : v.status === "skipped"
            ? "skipped"
            : "empty"
      return `- ${v.key} (${v.type}${v.party ? ", party" : ""}) "${v.label}"${v.hint ? `: ${v.hint}` : ""} [${state}]`
    })
    .join("\n")
  const signers = currentSigners(data)
  const parties = documentParties(data)
  const roles = data.roles
    .map((r) => {
      const fields = (signers.fields[r.key] ?? []).map((f) => f.fieldType).join(", ") || "no fields"
      const initials = r.initialsOnEveryPage ? ", initials every page" : ""
      const party = parties.find((p) => p.roleKey === r.key)
      const signsFor = party ? `; signs for {{${party.variableKey}}}` : ""
      return `- ${r.key} "${r.label}" (${r.recipientRole}${initials}): ${fields}; ${r.name && r.email ? "contact set" : "contact missing"}${signsFor}`
    })
    .join("\n")
  const unsigned = parties
    .filter((p) => !p.roleKey)
    .map((p) => `{{${p.variableKey}}}`)
    .join(", ")
  const proposals = (input.proposals ?? [])
    .map(
      (p) =>
        `- ${p.id} (${p.sectionId ? `section ${p.sectionId}` : "new sections"}): ${p.status.toLowerCase()}. ${p.rationale}`,
    )
    .join("\n")
  const section = data.content.content.find((s) => s.attrs.id === input.selectedSectionId)
  const selected = section ? sectionForPrompt(section, numbers.get(section.attrs.id) ?? null) : ""
  const text = data.content.content
    .map((s) => sectionForPrompt(s, numbers.get(s.attrs.id) ?? null))
    .join("\n\n")

  return `You help a member of ${input.organizationName} prepare "${data.title}" for signature. Today is ${input.today}.
You are a drafting assistant, not a lawyer, and you don't give legal advice. The person reviews and is responsible for the final document.

# Hard rules
1. Never invent facts. Names, addresses, amounts, dates, durations, legal terms and jurisdictions come only from the person. If you don't know a value, ask.
2. Ask with the ask_questions tool, never in plain text. Ask at most ${MAX_QUESTIONS_PER_BATCH} questions per call, most important first, one blank per question (variableKey). Offer options only for generic choices (e.g. "1 year", "2 years", "3 years"), never for a person's or company's details, and never pre-guess an answer.
3. Answers to ask_questions are applied to the document automatically. Don't call set_variables for them.
4. Use set_variables only for values the person typed in the chat, copied exactly as they wrote them. It refuses anything they didn't say.
5. A skipped blank stays empty and visibly unresolved. Don't ask about it again unless the person brings it up.
6. Change wording only by proposing: propose_section_edit (replace or delete one section) or propose_sections (new sections). The person accepts or rejects each proposal; nothing changes until they accept. Write sections as paragraphs and lists of plain text where {{key}} is a blank, **x** is bold and *x* is italic. Every specific the person hasn't given (an amount, a date, a duration, a percentage, a name, an address, a jurisdiction) must be a blank: use an existing key or declare a new one in newBlanks, then ask about it. Don't propose changes to signature sections. Don't re-propose a rejected change unless asked. Keep the rationale to one sentence.
7. Who signs is data, never text. To change signers or their fields, propose it with define_signers: the full list of roles (keep existing keys), each SIGNER or VIEWER (a copy), whether they initial every page, and each role's fields (a signer needs at least a SIGNATURE; TEXT and CHECKBOX need a label saying what to fill or agree to). Ask who signs before proposing if it isn't clear. Set party on a role to the party blank it signs for (a blank marked "party"), and when the text names a party nobody signs for, propose a signer for it. Mark a blank that names a party with party: true in newBlanks. Names and emails are entered in the Signers tab: include one only if the person said it in the chat or it is the filled value of a party who is a person signing for themselves (for a company, ask who signs on its behalf), and never ask for emails.
8. After the person answers, reply with one short sentence summarising what was applied (e.g. "Applied Kenyan law and a one-year term."), then ask the next batch if blanks remain.
9. Keep replies short and plain. No Markdown headings.

# Document (version ${input.versionId})
Blanks appear in the text as {{key}}.

${text}

# Blanks
${blanks || "(none)"}

# Signer roles
${roles}${unsigned ? `\nParties without a signer: ${unsigned}` : ""}${proposals ? `\n\n# Your recent proposals\n${proposals}` : ""}${selected ? `\n\n# Selected section\nThe person attached this section to their latest message; their question is about it.\n\n${selected}` : ""}`
}
