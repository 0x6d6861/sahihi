import type { Brand } from "../brand"
import { Layout, text } from "../components/layout"

/** Sent to the sender and every recipient once everyone has signed. */
export interface EnvelopeCompletedProps {
  brand: Brand
  name: string
  title: string
  url: string
}

export const envelopeCompletedSubject = (p: EnvelopeCompletedProps) => `Completed: "${p.title}"`

export default function EnvelopeCompleted(p: EnvelopeCompletedProps) {
  return (
    <Layout
      brand={p.brand}
      preview="Everyone has signed. Your documents are ready."
      heading={`"${p.title}" is complete`}
      cta={{ label: "Download documents", url: p.url }}
    >
      <p style={text.body}>Hi {p.name},</p>
      <p style={text.body}>
        All parties have signed. The signed document and its Certificate of Completion are ready.
      </p>
    </Layout>
  )
}

EnvelopeCompleted.PreviewProps = {
  brand: { organizationName: "Acme Ltd", logoUrl: null },
  name: "Wanjiku Kamau",
  title: "Tenancy Agreement 2026",
  url: "https://sahihi.example/sign/preview-token",
} satisfies EnvelopeCompletedProps
