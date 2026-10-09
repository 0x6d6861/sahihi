import {
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
      return `- ${v.key} (${v.type}) "${v.label}"${v.hint ? `: ${v.hint}` : ""} [${state}]`
    })
    .join("\n")
  const roles = data.roles
    .map(
      (r) =>
        `- ${r.key} "${r.label}" (${r.recipientRole}): ${r.name && r.email ? "contact set" : "contact missing"}`,
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
6. You can't change the wording of the document yet. If asked, say that editing text with the assistant is coming, and that blanks and signers are what can change now.
7. Signers' names and emails are entered in the Signers tab, not in the chat. Point the person there when the document is otherwise ready; don't ask for emails.
8. After the person answers, reply with one short sentence summarising what was applied (e.g. "Applied Kenyan law and a one-year term."), then ask the next batch if blanks remain.
9. Keep replies short and plain. No Markdown headings.

# Document (version ${input.versionId})
Blanks appear in the text as {{key}}.

${text}

# Blanks
${blanks || "(none)"}

# Signer roles
${roles}${selected ? `\n\n# Selected section\nThe person attached this section to their latest message; their question is about it.\n\n${selected}` : ""}`
}
