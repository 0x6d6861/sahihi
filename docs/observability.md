# Observability

Structured logs, error tracking and a queue dashboard (ADR 0016). All three follow rule 8: no raw
signing token, OTP code or personal data leaves the process in a log line, an error report or the
dashboard.

## Logs

`createLogger(service)` (`@sahihi/infra`). **Production:** one JSON line per event
(`{ time, level, service, msg, …fields }`), which Railway's log search can filter on. **Development:**
a short human-readable line.
- Fields go through `redact()` (`@sahihi/core`). `token`, `code`, `otp`, `password`, `secret`,
  `authorization`, `cookie`, `email`, `phone`, `name`, `dataUrl`… become `[redacted]` at any
  depth. Messages and strings go through `maskTokens()`: `/sign/<token>` → `/sign/[token]`, and
  `?token=…` → `?token=[redacted]`.
- `LOG_LEVEL` (`debug|info|warn|error`, default `info`).
- **API:** `requestLog` replaces `hono/logger`, which printed raw tokens from `/api/sign/<token>`.
  It logs one line per request: method, masked path, status, `ms` and a `requestId`. The id is
  taken from `x-request-id` if it looks valid, else generated, and echoed back in the response
  header. `/health` is logged at debug.
- **Worker:** `job done` (queue, job name, id, ms). A failed attempt is a `warn` that says it will
  retry; the final failure is an `error`. Job data is never logged: it can carry tokens and codes.
- **SMS in development:** with no Africa's Talking credentials, `NODE_ENV=development` prints
  the SMS (it contains the OTP), like Mailpit shows emails. Tests skip it; production throws.

## Error tracking (Sentry, optional)

It's off unless a DSN is set:

| Where | Env | Init |
|---|---|---|
| api, worker | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | `initErrorTracking(service)` (`@sahihi/infra`, `@sentry/bun`) |
| web (browser) | `NEXT_PUBLIC_SENTRY_DSN` (build time), `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `instrumentation-client.ts`, dynamic import only when set |
| web (server) | `SENTRY_DSN` | `instrumentation.ts` (`register`, `onRequestError`) |

- **What's captured:** errors only, with `tracesSampleRate: 0`.
  - API: unhandled errors from `app.onError`, tagged with `requestId` and `path`.
  - Worker: a job's final failure, tagged with queue, job name and id.
- **Privacy:**
  - `ERROR_TRACKING_DATA_COLLECTION` (the SDK's `dataCollection`) collects no user info, cookies,
    bodies or query strings, and only harmless headers.
  - `scrubErrorEvent` then masks tokens in URLs, messages and breadcrumbs, drops auth headers, and
    keeps only `user.id`.
- The CSP allows the DSN's host in `connect-src` (`buildCsp({ errorReportingOrigin })`).

## Queue dashboard (staff only)

bull-board at **`<api>/admin/queues`**, mounted only when `ADMIN_DASHBOARD_USER` and
`ADMIN_DASHBOARD_PASSWORD` (16+ characters) are set (`apps/api/src/admin.ts`).
- HTTP Basic auth (constant-time compare), rate-limited to 60/min per IP.
- **Redacted:** job `data` and `returnValue` go through `redact()`. Invite, reminder and OTP jobs
  carry raw tokens and codes; staff never see them.
- **Retry-only:** the only write is retrying failed jobs. Adding, editing, deleting, emptying or
  re-prioritising jobs returns 405. Otherwise the dashboard could send crafted emails or corrupt
  job data.
- It's on the api's own origin (not proxied by the web). On Railway, reach it via the api
  service's domain or private networking. It isn't tenant data, so `tenant-isolation.itest.ts`
  skips `/admin/queues/*`.

## Tests

- `observability.test.ts` (core): redaction, masking, log lines and event scrubbing.
- `observability.itest.ts` (api): no raw token in request logs, and request ids; dashboard auth,
  redacted job data, and the retry-only writes.
