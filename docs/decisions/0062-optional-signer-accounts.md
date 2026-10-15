# 0062: Optional signer accounts

- **Status:** accepted
- **Date:** 2026-10-15
- **Amends:** ADR 0002 and `docs/auth.md` ("signers never get accounts")

## Context
Signers sign from a link and need no account; that stays the rule. But someone who signs often
(employees, suppliers, directors) has no way to find what they signed except old emails, and a
signing link stops working after completion or a reminder. The redesign (`design/app/app.pen`,
section 14) offers an optional free account after signing.

## Decision
- **Never required.** Signing works exactly as before. After signing (and on the completed page),
  the signing page offers "Create a free account" and "Continue without an account"; it isn't
  shown inside an embedding app's iframe, and someone already signed in gets a link instead.
- **The token is not an identity.** A signing token never signs anyone in, never creates or links
  an account, and is never sent to the account routes. The sign-up page only **prefills** the
  email, passed in `sessionStorage` (not the URL), and better-auth's email verification is the
  only proof that links the account to anything.
- **Linking is by verified email only.** `GET /api/me/envelopes` lists `Recipient` rows whose email
  equals the caller's **verified** email (case-insensitive), in any workspace, excluding drafts. An
  unverified email gets an empty list. Each item carries only what the recipient already received:
  title, workspace and sender names, their own status and dates, the certificate code; never
  another recipient, a token or a hash.
- **Actions** (`apps/api/src/routes/my-envelopes.ts`), each rate-limited per user and 404 for
  any recipient id that isn't the caller's: download a completed envelope's files (as the
  completed signing link does; 410 once purged), and "Email me the signing link" while it's their
  turn, which rotates the link and emails it (same cooldown as a sender's reminder, the
  `recipient.link_requested` audit event, the raw token only in the job and the email).
- **No workspace needed.** `app/(personal)/signed` has its own frame (Personal, Create a
  workspace, account menu without Settings). Onboarding offers to skip to it for someone arriving
  from signing or who has envelopes.
- **Retention wins.** Purging redacts recipient emails, so a purged envelope leaves the list.

## Consequences
- Signers who opt in can find, download and resume their envelopes without the sender's help.
- Workspaces can't see who has an account; the account is separate from their workspace.
- New public-facing copy (site FAQ, privacy, security) needs legal review before launch.
- Tenant isolation: the three routes are scoped by verified email, not workspace
  (`tenant-isolation.itest.ts` lists them; `my-envelopes.itest.ts` covers the rules).
