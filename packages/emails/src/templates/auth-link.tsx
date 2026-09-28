import { Layout, text } from "../components/layout"

/** Account emails with one action link: verify email, reset password, org invitation. */
export interface AuthLinkProps {
  name: string
  heading: string
  body: string
  label: string
  url: string
}

export const authLinkSubject = (p: AuthLinkProps) => p.heading

export default function AuthLink(p: AuthLinkProps) {
  return (
    <Layout preview={p.body} heading={p.heading} cta={{ label: p.label, url: p.url }}>
      <p style={text.body}>Hi {p.name},</p>
      <p style={text.body}>{p.body}</p>
    </Layout>
  )
}

AuthLink.PreviewProps = {
  name: "Amina Otieno",
  heading: "Verify your email",
  body: "Confirm your email address to finish setting up your Sahihi account.",
  label: "Verify email",
  url: "https://sahihi.example/api/auth/verify-email?token=preview",
} satisfies AuthLinkProps
