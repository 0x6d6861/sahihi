# 0016: Observability that can't leak tokens or personal data

- **Status:** accepted
- **Date:** 2026-09-29

## Context
Signing links are bearer credentials, and OTP codes grant access. `hono/logger` printed every
request path, including `/api/sign/<raw token>`, into the logs. Queue jobs carry raw tokens by
design (the invite email needs them). Error trackers collect cookies, headers and bodies by
default.

## Decision
- **One redaction layer in core** (`redact`, `maskTokens`, `scrubErrorEvent`,
  `ERROR_TRACKING_DATA_COLLECTION`), used by the logger, Sentry (server and browser) and the queue
  dashboard.
- **Structured JSON logs** from our own small logger (no pino), with request ids; `hono/logger` is
  removed.
- **Sentry, optional** (product owner's choice): off without a DSN; errors only; the browser SDK is
  loaded by dynamic import only when configured.
- **bull-board for staff:** off unless credentials are set; Basic auth; data redacted;
  **retry-only** writes (our guard, since bull-board's read-only mode also blocks retries).

## Consequences
- New dependencies: `@sentry/bun` (infra), `@sentry/nextjs` (web), `@bull-board/api` and
  `@bull-board/hono` (api), all pinned.
- Any new secret-bearing field must use one of the redacted key names (or be added to
  `SECRET_KEYS`), or it will show up in logs.
- The dashboard can't edit jobs. Fixing a bad payload means a code or data fix, not a dashboard
  edit.
