# 0002: Signers authenticate with link tokens (+ optional OTP), not accounts

- **Status:** accepted
- **Date:** 2026-09-26

## Context
Requiring recipients to create accounts kills completion rates. But a link is a bearer credential.

## Decision
better-auth is for senders only. Each recipient gets a 256-bit random token; only its SHA-256 is
stored. Tokens expire, rotate on reminder and are cleared on void. Senders can require email or SMS OTP
per recipient, which sets a short-lived signed cookie scoped to `/api/sign`.

## Consequences
- Frictionless signing, with evidence (verification method, IP, UA) recorded per signer.
- Must be strict about token hygiene: no logging, no-referrer, rate limits (see `docs/security.md`).
- "Advanced" signatures with identity proofing come later via the CA provider.
