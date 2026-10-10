import type { GeneratedDocumentData } from "../model"
import {
  blank,
  field,
  p,
  party,
  role,
  section,
  signatureBlock,
  standardFields,
  t,
  ul,
  v,
} from "./build"

export function acceptableUsePolicy(): GeneratedDocumentData {
  return {
    title: "IT Acceptable Use Policy",
    pageSize: "A4",
    variables: [
      party("organisation_name", "Organisation's name"),
      blank("effective_date", "Effective date", "date"),
      blank("policy_owner", "Policy owner", "text", "Job title of the person responsible"),
      blank("security_contact", "Who to report incidents to", "text", "Team, role or address"),
      blank("review_date", "Next review date", "date"),
    ],
    roles: [role("approver", "Approver"), role("employee", "Employee")],
    content: {
      type: "doc",
      content: [
        section(
          "purpose",
          "Purpose",
          p(
            t("This policy sets the rules for using the devices, systems and data of "),
            v("organisation_name", true),
            t(' (the "Organisation"). It applies from '),
            v("effective_date"),
            t("."),
          ),
        ),
        section(
          "scope",
          "Scope",
          p(
            t(
              "It applies to everyone who uses the Organisation's systems: employees, contractors and volunteers, on the Organisation's devices or their own, at work or elsewhere.",
            ),
          ),
        ),
        section(
          "acceptable_use",
          "Acceptable Use",
          p(t("You must:")),
          ul(
            [t("use the Organisation's systems mainly for work; limited personal use is allowed;")],
            [t("keep your passwords private and use multi-factor authentication where offered;")],
            [t("lock your device when you leave it and keep its software up to date;")],
            [t("store work data only in systems the Organisation approves; and")],
            [t("handle personal data in line with data protection law and our instructions.")],
          ),
        ),
        section(
          "prohibited_use",
          "Prohibited Use",
          p(t("You must not:")),
          ul(
            [t("share your account or use another person's;")],
            [t("install unapproved software or disable security controls;")],
            [t("access, download or send unlawful, offensive or harassing material;")],
            [t("copy confidential information to personal accounts or devices; or")],
            [t("use the Organisation's systems for a private business.")],
          ),
        ),
        section(
          "monitoring",
          "Monitoring",
          p(
            t(
              "The Organisation may monitor the use of its systems to keep them secure and to check compliance with this policy, as the law allows. Personal use is not private from this monitoring.",
            ),
          ),
        ),
        section(
          "incidents",
          "Reporting Incidents",
          p(
            t(
              "Report a lost or stolen device, a suspected breach or a suspicious message immediately to ",
            ),
            v("security_contact"),
            t("."),
          ),
        ),
        section(
          "breaches",
          "Breaches",
          p(
            t(
              "A breach of this policy may lead to access being withdrawn and to disciplinary action, up to and including dismissal.",
            ),
          ),
        ),
        section(
          "ownership",
          "Ownership and Review",
          p(
            t("The "),
            v("policy_owner"),
            t(" owns this policy and will review it by "),
            v("review_date"),
            t("."),
          ),
        ),
        section(
          "signatures",
          "Approval and Acknowledgement",
          signatureBlock("approver", [t("For "), v("organisation_name", true)], {
            intro: "Approved for the Organisation:",
          }),
          signatureBlock("employee", [t("Employee", true)], {
            intro: "Acknowledged by the employee:",
            fields: [
              field(
                "employee_acknowledgement",
                "CHECKBOX",
                "I have read and understood this policy and agree to follow it.",
              ),
              ...standardFields("employee"),
            ],
          }),
        ),
      ],
    },
  }
}
