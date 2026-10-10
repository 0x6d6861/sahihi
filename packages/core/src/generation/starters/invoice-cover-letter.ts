import type { GeneratedDocumentData } from "../model"
import { blank, p, role, signatureBlock, t, table, unnumbered, v } from "./build"

export function invoiceCoverLetter(): GeneratedDocumentData {
  return {
    title: "Invoice Cover Letter",
    pageSize: "A4",
    variables: [
      blank("letter_date", "Date of the letter", "date"),
      blank("sender_name", "Your company's name", "text"),
      blank("sender_address", "Your company's address", "address"),
      blank("client_name", "Client's name", "text", "Person or company being invoiced"),
      blank("client_address", "Client's address", "address"),
      blank("invoice_number", "Invoice number", "text"),
      blank("invoice_date", "Invoice date", "date"),
      blank("services", "What the invoice is for", "text", "Goods or services delivered"),
      blank("amount_due", "Amount due", "amount", "Total with currency"),
      blank("due_date", "Payment due date", "date"),
      blank("payment_details", "How to pay", "text", "Bank account, mobile money or other details"),
      blank("contact_person", "Contact for questions", "text", "Name, phone or email"),
    ],
    roles: [role("sender", "Sender"), role("client", "Client")],
    content: {
      type: "doc",
      content: [
        unnumbered(
          "letter",
          "Letter",
          p(v("sender_name", true)),
          p(v("sender_address")),
          p(v("letter_date")),
          p(t("To: "), v("client_name", true)),
          p(v("client_address")),
          p(t("Dear "), v("client_name"), t(",")),
          p(t("Please find enclosed our invoice for "), v("services"), t(".")),
          table(
            ["Invoice", "Detail"],
            [
              [[t("Invoice number")], [v("invoice_number")]],
              [[t("Invoice date")], [v("invoice_date")]],
              [[t("Amount due")], [v("amount_due")]],
              [[t("Due date")], [v("due_date")]],
            ],
          ),
          p(
            t("Please pay by "),
            v("due_date"),
            t(" using these details: "),
            v("payment_details"),
            t("."),
          ),
          p(
            t("If you have any questions about this invoice, please contact "),
            v("contact_person"),
            t(". Thank you for your business."),
          ),
        ),
        unnumbered(
          "signatures",
          "Signatures",
          signatureBlock("sender", [t("For "), v("sender_name", true)], {
            intro: "Yours sincerely,",
          }),
          signatureBlock("client", [t("For "), v("client_name", true)], {
            intro: "Received, with the invoice enclosed:",
          }),
        ),
      ],
    },
  }
}
