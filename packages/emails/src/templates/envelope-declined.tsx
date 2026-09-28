import type { Brand } from "../brand"
import { Layout, text } from "../components/layout"

/** Sent to the sender and the other invited recipients when someone declines. */
export interface EnvelopeDeclinedProps {
  brand: Brand
  name: string
  title: string
  declinedBy: string
  reason: string | null
}

export const envelopeDeclinedSubject = (p: EnvelopeDeclinedProps) => `Declined: "${p.title}"`

export default function EnvelopeDeclined(p: EnvelopeDeclinedProps) {
  return (
    <Layout
      brand={p.brand}
      preview={`${p.declinedBy} declined to sign`}
      heading={`"${p.title}" was declined`}
    >
      <p style={text.body}>Hi {p.name},</p>
      <p style={text.body}>{p.declinedBy} declined to sign, so the envelope is closed.</p>
      {p.reason && <p style={text.quote}>{p.reason}</p>}
    </Layout>
  )
}

EnvelopeDeclined.PreviewProps = {
  brand: { organizationName: "Acme Ltd", logoUrl: null },
  name: "Amina Otieno",
  title: "Tenancy Agreement 2026",
  declinedBy: "Kip Rono",
  reason: "The property address is wrong.",
} satisfies EnvelopeDeclinedProps
