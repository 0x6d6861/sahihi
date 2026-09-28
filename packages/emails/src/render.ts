import { plainTextSelectors, render } from "@react-email/render"
import type { ReactElement } from "react"

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// Keep React Email's plain-text defaults (skip the hidden preview text, etc.) but don't upper-case
// headings: they contain document titles, which are user content.
const plainTextOptions = {
  plainText: true as const,
  htmlToTextOptions: {
    selectors: [...plainTextSelectors, { selector: "h1", options: { uppercase: false } }],
  },
}

/**
 * HTML and plain text rendered from the same element, so the two parts never drift apart. React
 * escapes every interpolated value (titles, messages and names are user input).
 */
export async function renderEmail(subject: string, element: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([render(element), render(element, plainTextOptions)])
  return { subject, html, text }
}
