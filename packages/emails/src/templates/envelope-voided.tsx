import type { Brand } from "../brand"
import { Layout, text } from "../components/layout"

/** Sent to invited recipients who hadn't signed when the sender voids the envelope. */
export interface EnvelopeVoidedProps {
  brand: Brand
  name: string
  title: string
  reason: string | null
}

export const envelopeVoidedSubject = (p: EnvelopeVoidedProps) => `Cancelled: "${p.title}"`

export default function EnvelopeVoided(p: EnvelopeVoidedProps) {
  return (
    <Layout
      brand={p.brand}
      preview="The sender cancelled this signing request"
      heading={`"${p.title}" was cancelled`}
    >
      <p style={text.body}>Hi {p.name},</p>
      <p style={text.body}>
        The sender cancelled this signing request. Your previous link no longer works and there's
        nothing more you need to do.
      </p>
      {p.reason && <p style={text.quote}>{p.reason}</p>}
    </Layout>
  )
}

EnvelopeVoided.PreviewProps = {
  brand: { organizationName: "Acme Ltd", logoUrl: null },
  name: "Wanjiku Kamau",
  title: "Tenancy Agreement 2026",
  reason: "Sent the wrong version.",
} satisfies EnvelopeVoidedProps
