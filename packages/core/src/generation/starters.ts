import type {
  BlockNode,
  FieldNode,
  GeneratedDocumentData,
  GeneratedFieldType,
  InlineNode,
  Paragraph,
  Section,
  Variable,
} from "./model"

/**
 * Starters: curated documents the assistant fills in (docs/ai-documents.md → Starters). The wording
 * is fixed and reviewed; every specific (party, date, amount, duration, law) is a blank the
 * assistant asks about. Starters are code, not database rows, so they ship with a review.
 */

const t = (text: string, bold = false): InlineNode =>
  bold ? { type: "text", text, marks: [{ type: "bold" }] } : { type: "text", text }
const v = (key: string, bold = false): InlineNode =>
  bold
    ? { type: "variable", attrs: { key }, marks: [{ type: "bold" }] }
    : { type: "variable", attrs: { key } }
const p = (...content: InlineNode[]): Paragraph => ({ type: "paragraph", content })
const ol = (...items: InlineNode[][]): BlockNode => ({
  type: "orderedList",
  content: items.map((content) => ({ type: "listItem", content: [p(...content)] })),
})
const section = (id: string, title: string, ...content: BlockNode[]): Section => ({
  type: "section",
  attrs: { id, title, numbered: true },
  content,
})
const field = (id: string, fieldType: GeneratedFieldType, label?: string): FieldNode => ({
  type: "field",
  attrs: { id, fieldType, required: true, ...(label ? { label } : {}) },
})
const blank = (key: string, label: string, type: Variable["type"], hint?: string): Variable => ({
  key,
  label,
  type,
  ...(hint ? { hint } : {}),
  value: null,
  status: "unresolved",
})
const signatureBlock = (roleKey: string, partyKey: string): BlockNode => ({
  type: "signatureBlock",
  attrs: { roleKey },
  content: [
    p(t("For "), v(partyKey, true)),
    field(`${roleKey}_signature`, "SIGNATURE", "Signature"),
    field(`${roleKey}_name`, "NAME", "Name"),
    field(`${roleKey}_date`, "DATE_SIGNED", "Date"),
  ],
})

function mutualNda(): GeneratedDocumentData {
  return {
    title: "Mutual Non-Disclosure Agreement",
    pageSize: "A4",
    variables: [
      blank("effective_date", "Effective date", "date"),
      blank(
        "party_a_name",
        "First party's name",
        "text",
        "Full legal name of the person or company",
      ),
      blank("party_a_address", "First party's address", "address", "Address for notices"),
      blank(
        "party_b_name",
        "Second party's name",
        "text",
        "Full legal name of the person or company",
      ),
      blank("party_b_address", "Second party's address", "address", "Address for notices"),
      blank("purpose", "Purpose of the disclosure", "text", "What the parties are discussing"),
      blank("term", "Term of the agreement", "duration", "How long the agreement runs"),
      blank(
        "survival_period",
        "Confidentiality period after the agreement ends",
        "duration",
        "How long the obligations last once the agreement ends",
      ),
      blank("governing_law", "Governing law", "jurisdiction", "Country or state whose law applies"),
    ],
    roles: [
      {
        key: "party_a",
        label: "First party",
        recipientRole: "SIGNER",
        name: null,
        email: null,
        initialsOnEveryPage: false,
      },
      {
        key: "party_b",
        label: "Second party",
        recipientRole: "SIGNER",
        name: null,
        email: null,
        initialsOnEveryPage: false,
      },
    ],
    content: {
      type: "doc",
      content: [
        section(
          "parties",
          "Parties and Effective Date",
          p(
            t('This Mutual Non-Disclosure Agreement (the "Agreement") is made on '),
            v("effective_date"),
            t(' (the "Effective Date") between:'),
          ),
          ol(
            [v("party_a_name", true), t(" of "), v("party_a_address"), t("; and")],
            [v("party_b_name", true), t(" of "), v("party_b_address"), t(".")],
          ),
          p(
            t(
              'Each is a "Party" and together they are the "Parties". Each Party may disclose information (as the "Disclosing Party") and receive information (as the "Receiving Party").',
            ),
          ),
        ),
        section(
          "purpose",
          "Purpose",
          p(
            t("The Parties wish to exchange confidential information in connection with "),
            v("purpose"),
            t(
              ' (the "Purpose"). The Receiving Party may use the Disclosing Party\'s Confidential Information only for the Purpose.',
            ),
          ),
        ),
        section(
          "confidential_information",
          "Confidential Information",
          p(
            t(
              '"Confidential Information" means any non-public information disclosed by the Disclosing Party to the Receiving Party, in any form, that is marked confidential or that a reasonable person would understand to be confidential from its nature or the circumstances of disclosure.',
            ),
          ),
        ),
        section(
          "exclusions",
          "Exclusions",
          p(t("Confidential Information does not include information that:")),
          ol(
            [t("is or becomes public through no breach of this Agreement by the Receiving Party;")],
            [t("the Receiving Party already held without a duty of confidence before disclosure;")],
            [t("a third party lawfully disclosed to the Receiving Party without restriction; or")],
            [
              t(
                "the Receiving Party independently developed without use of the Disclosing Party's Confidential Information.",
              ),
            ],
          ),
        ),
        section(
          "obligations",
          "Obligations of the Receiving Party",
          p(t("The Receiving Party shall:")),
          ol(
            [t("keep the Confidential Information confidential;")],
            [t("use it only for the Purpose;")],
            [
              t(
                "disclose it only to its employees and advisers who need to know it for the Purpose and who are bound by confidentiality obligations no less protective than this Agreement; and",
              ),
            ],
            [t("protect it with at least the care it uses for its own confidential information.")],
          ),
          p(
            t(
              "The Receiving Party may disclose Confidential Information when required by law, after giving the Disclosing Party prompt notice where the law allows.",
            ),
          ),
        ),
        section(
          "return",
          "Return of Information",
          p(
            t(
              "On the Disclosing Party's written request, the Receiving Party shall promptly return or destroy the Disclosing Party's Confidential Information, except copies it must keep by law.",
            ),
          ),
        ),
        section(
          "term",
          "Term",
          p(
            t("This Agreement starts on the Effective Date and continues for "),
            v("term"),
            t(". The obligations in this Agreement survive its end for "),
            v("survival_period"),
            t("."),
          ),
        ),
        section(
          "no_licence",
          "No Licence",
          p(
            t(
              "All Confidential Information remains the property of the Disclosing Party. Nothing in this Agreement grants any licence or other right in it, except the limited right to use it for the Purpose.",
            ),
          ),
        ),
        section(
          "governing_law",
          "Governing Law",
          p(t("This Agreement is governed by the laws of "), v("governing_law"), t(".")),
        ),
        section(
          "signatures",
          "Signatures",
          p(t("Each Party signs this Agreement on the date shown below.")),
          signatureBlock("party_a", "party_a_name"),
          signatureBlock("party_b", "party_b_name"),
        ),
      ],
    },
  }
}

export interface Starter {
  key: string
  name: string
  description: string
  build: () => GeneratedDocumentData
}

export const STARTERS: readonly Starter[] = [
  {
    key: "mutual-nda",
    name: "Mutual NDA",
    description: "Two parties share confidential information with each other.",
    build: mutualNda,
  },
]

export function findStarter(key: string): Starter | undefined {
  return STARTERS.find((s) => s.key === key)
}
