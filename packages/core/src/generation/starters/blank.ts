import type { GeneratedDocumentData } from "../model"
import { p, role, section, standardFields, unnumbered } from "./build"

/** The `starter` a blank document records (not one of `STARTERS`: there's nothing to review). */
export const BLANK_STARTER = "blank"
/** The `starter` an imported document records (ADR 0049). */
export const IMPORT_STARTER = "import"

/**
 * A blank document (docs/ai-documents.md → Starting points): an empty section to write in, and one
 * signer with the usual fields. The assistant asks what it's for and proposes sections.
 */
export function blankDocument(): GeneratedDocumentData {
  return {
    title: "Untitled document",
    pageSize: "A4",
    content: {
      type: "doc",
      content: [
        section("s1", "Untitled section", p()),
        unnumbered("signatures", "Signatures", {
          type: "signatureBlock",
          attrs: { roleKey: "signer_1" },
          content: standardFields("signer_1"),
        }),
      ],
    },
    variables: [],
    roles: [role("signer_1", "Signer 1")],
  }
}
