import type { Brand } from "../brand"
import { Layout, text } from "../components/layout"

/** Invitation to sign, and the manual/automatic reminder (same email, reminder wording). */
export interface SigningInviteProps {
  brand: Brand
  recipientName: string
  senderName: string
  title: string
  message: string | null
  url: string
  reminder?: boolean
}

export const signingInviteSubject = (p: SigningInviteProps) =>
  `${p.reminder ? "Reminder: " : ""}${p.senderName} sent you "${p.title}" to sign`

export default function SigningInvite(p: SigningInviteProps) {
  return (
    <Layout
      brand={p.brand}
      preview={`${p.senderName} (${p.brand.organizationName}) requested your signature`}
      heading={`Please review and sign "${p.title}"`}
      cta={{ label: "Review document", url: p.url }}
      footer="This link is personal to you. Don't forward it. It stops working once you've signed, or if the sender sends a new one."
    >
      <p style={text.body}>Hi {p.recipientName},</p>
      <p style={text.body}>
        {p.reminder ? "A reminder: " : ""}
        {p.senderName} ({p.brand.organizationName}) has requested your signature.
      </p>
      {p.message && <p style={text.quote}>{p.message}</p>}
    </Layout>
  )
}

SigningInvite.PreviewProps = {
  brand: { organizationName: "Acme Ltd", logoUrl: null },
  recipientName: "Wanjiku Kamau",
  senderName: "Amina Otieno",
  title: "Tenancy Agreement 2026",
  message: "Hi Wanjiku,\nPlease sign by Friday. It's the updated rent schedule.",
  url: "https://sahihi.example/sign/preview-token",
  reminder: false,
} satisfies SigningInviteProps
