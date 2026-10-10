import type { GeneratedDocumentData } from "../model"
import { blank, p, role, section, signatureBlock, t, table, unnumbered, v } from "./build"

export function offerLetter(): GeneratedDocumentData {
  return {
    title: "Offer of Employment",
    pageSize: "A4",
    variables: [
      blank("letter_date", "Date of the letter", "date"),
      blank("employer_name", "Employer's name", "text", "Registered name of the company"),
      blank("employer_address", "Employer's address", "address"),
      blank(
        "candidate_name",
        "Candidate's name",
        "text",
        "Full name of the person offered the job",
      ),
      blank("candidate_address", "Candidate's address", "address"),
      blank("job_title", "Job title", "text"),
      blank("reports_to", "Reports to", "text", "Job title of the candidate's manager"),
      blank("place_of_work", "Place of work", "address", "Office or site, or remote"),
      blank("start_date", "Start date", "date"),
      blank("salary", "Gross salary", "amount", "Amount, currency and period, e.g. per month"),
      blank("pay_schedule", "When salary is paid", "text", "For example, monthly in arrears"),
      blank("working_hours", "Normal working hours", "text", "Days and hours of work"),
      blank("probation_period", "Probation period", "duration"),
      blank("notice_period", "Notice period after probation", "duration"),
      blank("annual_leave", "Annual leave", "duration", "Paid leave days per year"),
      blank("offer_expiry", "Accept by", "date", "Last date to accept the offer"),
      blank("governing_law", "Governing law", "jurisdiction", "Country or state whose law applies"),
    ],
    roles: [role("employer", "Employer"), role("candidate", "Candidate")],
    content: {
      type: "doc",
      content: [
        unnumbered(
          "opening",
          "Introduction",
          p(v("letter_date")),
          p(v("candidate_name", true)),
          p(v("candidate_address")),
          p(t("Dear "), v("candidate_name"), t(",")),
          p(
            v("employer_name", true),
            t(" of "),
            v("employer_address"),
            t(' (the "Employer") is pleased to offer you the position of '),
            v("job_title"),
            t(" on the terms below."),
          ),
        ),
        section(
          "key_terms",
          "Key Terms",
          table(
            ["Term", "Detail"],
            [
              [[t("Job title")], [v("job_title")]],
              [[t("Reports to")], [v("reports_to")]],
              [[t("Place of work")], [v("place_of_work")]],
              [[t("Start date")], [v("start_date")]],
              [[t("Gross salary")], [v("salary")]],
              [[t("Salary paid")], [v("pay_schedule")]],
              [[t("Working hours")], [v("working_hours")]],
              [[t("Annual leave")], [v("annual_leave")]],
            ],
          ),
        ),
        section(
          "duties",
          "Duties",
          p(
            t(
              "You will perform the duties reasonably expected of the role, follow the Employer's lawful instructions and policies, and devote your working time to the Employer's business.",
            ),
          ),
        ),
        section(
          "pay",
          "Salary and Deductions",
          p(
            t("The Employer will pay your gross salary of "),
            v("salary"),
            t(", "),
            v("pay_schedule"),
            t(
              ", less the deductions required by law. Your salary will be reviewed from time to time.",
            ),
          ),
        ),
        section(
          "probation",
          "Probation",
          p(
            t("Your first "),
            v("probation_period"),
            t(
              " of employment are a probation period. During probation, either of us may end the employment with the notice the law requires for probationary employees.",
            ),
          ),
        ),
        section(
          "leave",
          "Leave",
          p(
            t("You are entitled to "),
            v("annual_leave"),
            t(
              " of paid annual leave, taken at times agreed with your manager, plus public holidays and any other leave the law provides.",
            ),
          ),
        ),
        section(
          "termination",
          "Ending the Employment",
          p(
            t("After probation, either of us may end the employment by giving "),
            v("notice_period"),
            t(
              " written notice, or pay in place of notice. The Employer may end the employment without notice where the law allows.",
            ),
          ),
        ),
        section(
          "confidentiality",
          "Confidentiality",
          p(
            t(
              "During and after your employment you must keep the Employer's confidential information confidential and use it only for your work for the Employer.",
            ),
          ),
        ),
        section(
          "conditions",
          "Conditions and Acceptance",
          p(
            t(
              "This offer depends on you being legally entitled to work in the place of work and on the information you have given us being accurate. It lapses if not accepted by ",
            ),
            v("offer_expiry"),
            t(". This letter is governed by the laws of "),
            v("governing_law"),
            t("."),
          ),
        ),
        section(
          "signatures",
          "Signatures",
          p(t("Signed for the Employer, and by the Candidate to accept this offer.")),
          signatureBlock("employer", [t("For "), v("employer_name", true)]),
          signatureBlock("candidate", [v("candidate_name", true)], {
            intro: "I accept this offer of employment on the terms set out in this letter.",
          }),
        ),
      ],
    },
  }
}
