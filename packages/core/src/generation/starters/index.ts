import type { GeneratedDocumentData } from "../model"
import { acceptableUsePolicy } from "./acceptable-use-policy"
import { boardResolution } from "./board-resolution"
import { invoiceCoverLetter } from "./invoice-cover-letter"
import { mutualNda } from "./mutual-nda"
import { offerLetter } from "./offer-letter"

/**
 * Starters: curated documents the assistant fills in (docs/ai-documents.md → Starters). The wording
 * is fixed and reviewed; every specific (party, date, amount, duration, law) is a blank the
 * assistant asks about. Starters are code, not database rows, so they ship with a review.
 */

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
  {
    key: "offer-letter",
    name: "Offer letter",
    description: "Offer someone a job; they accept by signing.",
    build: offerLetter,
  },
  {
    key: "acceptable-use-policy",
    name: "IT acceptable use policy",
    description: "Rules for work devices and systems, approved and acknowledged by an employee.",
    build: acceptableUsePolicy,
  },
  {
    key: "board-resolution",
    name: "Board resolution",
    description: "A written resolution the directors sign instead of meeting.",
    build: boardResolution,
  },
  {
    key: "invoice-cover-letter",
    name: "Invoice cover letter",
    description: "Send an invoice with a letter the client signs to acknowledge receipt.",
    build: invoiceCoverLetter,
  },
]

export function findStarter(key: string): Starter | undefined {
  return STARTERS.find((s) => s.key === key)
}
