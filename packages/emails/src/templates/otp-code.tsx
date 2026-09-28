import { Layout, text } from "../components/layout"

/** Email verification code for signers with EMAIL_OTP (Sahihi-branded). */
export interface OtpCodeProps {
  name: string
  code: string
}

export const otpCodeSubject = (p: OtpCodeProps) => `Your Sahihi verification code: ${p.code}`

export default function OtpCode(p: OtpCodeProps) {
  return (
    <Layout
      preview={`Your code is ${p.code}. It expires in 10 minutes.`}
      heading="Your verification code"
      footer="Never share this code. Sahihi staff will never ask for it."
    >
      <p style={text.body}>Hi {p.name},</p>
      <p style={text.code}>{p.code}</p>
      <p style={text.body}>It expires in 10 minutes.</p>
    </Layout>
  )
}

OtpCode.PreviewProps = { name: "Wanjiku Kamau", code: "482913" } satisfies OtpCodeProps
