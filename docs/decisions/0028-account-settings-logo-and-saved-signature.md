# 0028: Account settings, public workspace logos and saved signatures

- **Status:** accepted
- **Date:** 2026-10-07

## Context

Settings only covered the workspace (members, plan, data, API). Users had no way to change their
name, email or password, turn on two-factor authentication, or see where they're signed in. We also
wanted two pieces of branding: a **workspace logo** in the emails sent to recipients, and a
**saved signature** a user can reuse when they sign.

Constraints:

- The storage bucket is private and presigned URLs expire in minutes, but an email may be opened
  days later, through image proxies, on another origin.
- `Organization.logo` already fed `brandFor()` in the worker, and better-auth lets anyone with
  `organization:update` set it to any URL.
- Signers don't have accounts (ADR 0002), and the signing routes must not depend on a session.

## Decision

1. **better-auth first.** Name, email change, password, sessions and 2FA (TOTP + backup codes,
   `twoFactor` plugin) use better-auth's endpoints from the browser. Our API only adds what
   better-auth can't store: the logo and the saved signature.
2. **Logos are served by a public, versioned route.** The browser re-encodes the upload as a PNG of
   at most 640×160; the API validates it and stores it under the workspace prefix. `Organization.logo`
   holds `{WEB_URL}/api/branding/{orgId}/logo.png?v={version}`. The route streams the object whose
   key is in `WorkspaceSettings.logoKey`, with long caching and `Cross-Origin-Resource-Policy:
   cross-origin`. A new upload means a new version, so caches never serve a stale logo.
3. **Only our URL can be the logo.** better-auth's create/update organization hooks refuse a
   `logo`. Emails accept https URLs, plus the web origin itself (http in development).
4. **Saved signatures belong to the user**, not the workspace (`SavedSignature`, `user/{userId}/…`).
   The signing page asks `GET /api/me/signatures` and pre-fills the capture dialog only when the
   signed-in user's email equals the recipient's. The signing routes don't change: the PNG is
   submitted as if just drawn, and is stamped and audited the same way.
5. **Profile pictures are not public.** Same upload pattern as the logo (browser re-encodes,
   API validates, versioned URL in `User.image`), but `/api/avatars/:userId` needs a session and
   answers only the user and their workspace mates: a face is personal data, a logo isn't.

## Consequences

- One field (`Organization.logo`) drives emails and the signing page; nothing else has to know
  about storage.
- Logos are public by design: anyone who knows an org id can fetch its logo. That's the point of a
  logo, and the route serves nothing else.
- Saved signatures aren't evidence of anything by themselves; the audit trail still records the
  signing event (IP, user agent, consent) exactly as before.
- A user who changes email no longer sees their signature offered on envelopes addressed to the old
  address. That's intended.
- Deleting a user (not offered yet) must also delete `user/{userId}/` in storage (signature,
  initials, picture).
