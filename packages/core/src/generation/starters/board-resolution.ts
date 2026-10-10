import type { GeneratedDocumentData } from "../model"
import { blank, ol, p, role, section, signatureBlock, t, v } from "./build"

export function boardResolution(): GeneratedDocumentData {
  return {
    title: "Written Resolution of the Board of Directors",
    pageSize: "A4",
    variables: [
      blank("company_name", "Company's name", "text", "Registered name of the company"),
      blank("registration_number", "Registration number", "text"),
      blank("resolution_date", "Date of the resolution", "date"),
      blank(
        "subject",
        "What the resolution is about",
        "text",
        "For example, opening a bank account",
      ),
      blank(
        "resolution",
        "What the board resolves",
        "text",
        "The decision itself, starting with a verb, e.g. approve the lease of new offices",
      ),
      blank(
        "authorised_person",
        "Who carries it out",
        "text",
        "Name or role of the person authorised to act",
      ),
    ],
    roles: [role("director_1", "Director 1"), role("director_2", "Director 2")],
    content: {
      type: "doc",
      content: [
        section(
          "company",
          "Company",
          p(
            t("Written resolution of the directors of "),
            v("company_name", true),
            t(" (registration number "),
            v("registration_number"),
            t(') (the "Company"), dated '),
            v("resolution_date"),
            t("."),
          ),
        ),
        section(
          "background",
          "Background",
          p(
            t("The directors have considered "),
            v("subject"),
            t(
              ". Each director has declared any interest in the matter as the Company's articles and the law require.",
            ),
          ),
        ),
        section(
          "resolutions",
          "Resolutions",
          p(t("The directors resolve:")),
          ol(
            [t("to "), v("resolution"), t("; and")],
            [
              t("that "),
              v("authorised_person"),
              t(
                " is authorised to sign all documents and do everything necessary to give effect to this resolution.",
              ),
            ],
          ),
        ),
        section(
          "effect",
          "Effect",
          p(
            t(
              "This resolution is passed as a written resolution under the Company's articles of association. It is as valid as if it had been passed at a meeting of the directors properly called and held, and takes effect when the last director required signs it. It may be signed in counterparts and electronically.",
            ),
          ),
        ),
        section(
          "signatures",
          "Signatures",
          p(t("Signed by the directors:")),
          signatureBlock("director_1", [t("Director", true)]),
          signatureBlock("director_2", [t("Director", true)]),
        ),
      ],
    },
  }
}
