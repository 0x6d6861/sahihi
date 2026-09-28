import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"
import type { Brand } from "../brand"

/**
 * Shared email shell. Inline styles only (email clients ignore stylesheets), neutral colours that
 * work on light backgrounds, a single primary button.
 */
const colors = {
  page: "#f4f4f5",
  card: "#ffffff",
  ink: "#18181b",
  body: "#3f3f46",
  muted: "#71717a",
  rule: "#e4e4e7",
  button: "#18181b",
  buttonText: "#ffffff",
}

const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

export const text = {
  body: { margin: "0 0 12px", fontSize: "14px", lineHeight: "1.6", color: colors.body },
  quote: {
    margin: "16px 0",
    padding: "12px 16px",
    background: colors.page,
    borderRadius: "8px",
    fontSize: "14px",
    lineHeight: "1.6",
    color: colors.ink,
    whiteSpace: "pre-line" as const,
  },
  code: {
    margin: "16px 0",
    fontSize: "30px",
    fontWeight: 700,
    letterSpacing: "8px",
    color: colors.ink,
  },
}

export function Layout({
  preview,
  brand,
  heading,
  children,
  cta,
  footer,
}: {
  /** Inbox preview line (shown next to the subject). */
  preview: string
  /** Org branding; omit for Sahihi-branded (auth, OTP) emails. */
  brand?: Brand
  heading: string
  children: ReactNode
  cta?: { label: string; url: string }
  footer?: string
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, background: colors.page, fontFamily: font, color: colors.ink }}>
        <Container
          style={{
            maxWidth: "560px",
            margin: "32px auto",
            padding: "32px",
            background: colors.card,
            borderRadius: "12px",
          }}
        >
          <Section style={{ marginBottom: "24px" }}>
            {brand?.logoUrl ? (
              <Img src={brand.logoUrl} alt={brand.organizationName} height="32" />
            ) : (
              <Text style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: colors.ink }}>
                {brand?.organizationName ?? "Sahihi"}
              </Text>
            )}
          </Section>
          <Heading
            as="h1"
            style={{ margin: "0 0 16px", fontSize: "20px", lineHeight: "1.3", color: colors.ink }}
          >
            {heading}
          </Heading>
          {children}
          {cta && (
            <Section style={{ margin: "28px 0" }}>
              <Button
                href={cta.url}
                style={{
                  background: colors.button,
                  color: colors.buttonText,
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {cta.label}
              </Button>
            </Section>
          )}
          <Hr style={{ borderColor: colors.rule, margin: "24px 0 16px" }} />
          <Text style={{ margin: 0, fontSize: "12px", lineHeight: "1.5", color: colors.muted }}>
            {footer ?? "If you weren't expecting this email, you can ignore it."}
          </Text>
          {brand && (
            <Text style={{ margin: "8px 0 0", fontSize: "12px", color: colors.muted }}>
              {`Sent via Sahihi on behalf of ${brand.organizationName}.`}
            </Text>
          )}
        </Container>
      </Body>
    </Html>
  )
}
