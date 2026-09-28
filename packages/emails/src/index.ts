/**
 * @sahihi/emails: every transactional email Sahihi sends, as React Email components.
 *
 * Each function returns `{ subject, html, text }` ready for the mailer. Components live in
 * `src/templates/` (one file per email, with `PreviewProps` for `bun run emails:dev`).
 * Server-only: imported by the worker, never by the web app.
 */
import { createElement } from "react"
import { renderEmail } from "./render"
import AuthLink, { type AuthLinkProps, authLinkSubject } from "./templates/auth-link"
import EnvelopeCompleted, {
  type EnvelopeCompletedProps,
  envelopeCompletedSubject,
} from "./templates/envelope-completed"
import EnvelopeDeclined, {
  type EnvelopeDeclinedProps,
  envelopeDeclinedSubject,
} from "./templates/envelope-declined"
import EnvelopeVoided, {
  type EnvelopeVoidedProps,
  envelopeVoidedSubject,
} from "./templates/envelope-voided"
import OtpCode, { type OtpCodeProps, otpCodeSubject } from "./templates/otp-code"
import SigningInvite, {
  type SigningInviteProps,
  signingInviteSubject,
} from "./templates/signing-invite"

export { type Brand, brandFor, safeLogoUrl } from "./brand"
export type { RenderedEmail } from "./render"
export type {
  AuthLinkProps,
  EnvelopeCompletedProps,
  EnvelopeDeclinedProps,
  EnvelopeVoidedProps,
  OtpCodeProps,
  SigningInviteProps,
}

// ── Signing (org-branded) ────────────────────────────────────────────────────
export const signingInvite = (p: SigningInviteProps) =>
  renderEmail(signingInviteSubject(p), createElement(SigningInvite, p))

export const envelopeCompleted = (p: EnvelopeCompletedProps) =>
  renderEmail(envelopeCompletedSubject(p), createElement(EnvelopeCompleted, p))

export const envelopeDeclined = (p: EnvelopeDeclinedProps) =>
  renderEmail(envelopeDeclinedSubject(p), createElement(EnvelopeDeclined, p))

export const envelopeVoided = (p: EnvelopeVoidedProps) =>
  renderEmail(envelopeVoidedSubject(p), createElement(EnvelopeVoided, p))

// ── Sahihi-branded ───────────────────────────────────────────────────────────
export const otpEmail = (p: OtpCodeProps) =>
  renderEmail(otpCodeSubject(p), createElement(OtpCode, p))

export const authLink = (p: AuthLinkProps) =>
  renderEmail(authLinkSubject(p), createElement(AuthLink, p))

/** Every template, for tests and tooling (e.g. rendering all previews). */
export const TEMPLATES = {
  "signing-invite": { component: SigningInvite, subject: signingInviteSubject },
  "envelope-completed": { component: EnvelopeCompleted, subject: envelopeCompletedSubject },
  "envelope-declined": { component: EnvelopeDeclined, subject: envelopeDeclinedSubject },
  "envelope-voided": { component: EnvelopeVoided, subject: envelopeVoidedSubject },
  "otp-code": { component: OtpCode, subject: otpCodeSubject },
  "auth-link": { component: AuthLink, subject: authLinkSubject },
} as const
