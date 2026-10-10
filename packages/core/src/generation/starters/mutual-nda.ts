import type { GeneratedDocumentData } from "../model"
import { blank, ol, p, party, role, section, signatureBlock, t, v } from "./build"

export function mutualNda(): GeneratedDocumentData {
  return {
    title: "Mutual Non-Disclosure Agreement",
    pageSize: "A4",
    variables: [
      blank("effective_date", "Effective date", "date"),
      party("party_a_name", "First party's name", "Full legal name of the person or company"),
      blank("party_a_address", "First party's address", "address", "Address for notices"),
      party("party_b_name", "Second party's name", "Full legal name of the person or company"),
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
    roles: [role("party_a", "First party"), role("party_b", "Second party")],
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
          signatureBlock("party_a", [t("For "), v("party_a_name", true)]),
          signatureBlock("party_b", [t("For "), v("party_b_name", true)]),
        ),
      ],
    },
  }
}
