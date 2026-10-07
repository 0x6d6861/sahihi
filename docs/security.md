# Security

Threat model in one line: **a signing link is a bearer credential, the audit trail is evidence, and
tenants must never see each other's data.**

## Tenant isolation

- Every tenant-owned model carries `organizationId`: `Document` and `Envelope` directly;
  `Recipient`, `Field`, `AuditEvent` and `Certificate` through their envelope.
- In authenticated routes, **always** load the root with `forOrganization(orgId)`:
  ```ts
  const scope = forOrganization(c.get("organizationId"))
  const env = await prisma.envelope.findFirst({ where: scope.envelope({ id }) })
  if (!env) notFound("Envelope")        // 404, not 403, so ids don't leak
  ```
- Child rows (`recipient`, `field`) are only touched **after** the parent has been loaded with the
  scope, and always filtered by that parent's id.
- Never use `findUnique({ where: { id } })` on a tenant model in an authenticated route.
- S3 keys are prefixed `org/{orgId}/…`, but authorization comes from the DB lookup, not from the key.
- `apps/api/test/tenant-isolation.itest.ts` calls **every** tenant route as the owner of another
  org, with a valid body and the first org's ids. Each must return 404, lists must not include the
  first org's rows, and a snapshot of its documents, envelopes, recipients, fields and audit events
  must be unchanged. The test also checks that every route in `app.routes` is classified (tenant,
  list, or not tenant-scoped with a reason), so a new route without a cross-tenant case fails CI.
- Planned: Postgres row-level security as defence in depth.

## Signing tokens

- 32 random bytes → base64url (43 characters). Validated against `^[A-Za-z0-9_-]{43}$` before any DB
  lookup.
- Stored only as `sha256("signing-token:" + token)`, with a unique index on `Recipient.tokenHash`.
- The raw token exists only in the `envelope.invite`/`reminder` job payload and the email body.
  **Never log it**, and never put it in an audit event or error message.
- Expiry: `tokenExpiresAt` = min(TTL, envelope expiry). Rotated on every reminder; cleared on void.
- `/sign/*` pages send `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex` (`next.config.ts`),
  so tokens don't leak to third parties.
- Unknown token → 404 `invalid_link` with no further detail.

## OTP

- 6 digits drawn by rejection sampling (no modulo bias), stored as `sha256("otp:"+recipientId+":"+code)`.
- 10-minute TTL, 5 attempts per code, 5 sends per 15 minutes per token, constant-time comparison.
- Attempts are claimed atomically (`updateMany … attempts < 5 → increment`) **before** comparing.
  Read-then-increment let parallel requests all see the same count: 20 concurrent guesses got 15
  through instead of 5. `signing-otp.itest.ts` covers the lockout and the parallel case.
- On success, a signed httpOnly cookie (HMAC keyed from `BETTER_AUTH_SECRET`) scoped to `/api/sign`
  for 30 minutes and bound to the recipient id.

## Rate limiting

`rateLimit({ bucket, limit, windowSec, key? })` is a Redis fixed window. Current limits:

| Route | Limit |
|---|---|
| `/api/sign/:token*` | 120 / min / IP |
| `/api/sign/:token/otp` | 5 / 15 min / token |
| `/api/verify/*` | 30 / min / IP |
| `/api/branding/:orgId/logo.png` (public workspace logo, ADR 0028) | 300 / min / IP |
| `/api/v1/*` (public API) | 1200 / min / IP, then 600 / min / API key |

better-auth applies its own limits to `/api/auth/*`.

**Client IP** (rate-limit key and the audit trail's `ipAddress`): `clientMeta()` →
`clientIpFromForwarded()` (`@sahihi/core`) takes the `X-Forwarded-For` entry **`TRUSTED_PROXY_HOPS`
from the right**. That's the one our own proxy appended. The left side is whatever the client sent;
trusting it (as before) let anyone pick their own rate-limit bucket and forge the IP in the evidence.
`X-Real-IP` is ignored.
- Railway: `TRUSTED_PROXY_HOPS=1`. The edge appends the client, and the web's `/api` rewrite passes
  the header through unchanged (checked in dev: Next adds nothing).
- Add one per extra proxy that appends (e.g. a CDN in front, or the web calling the API through a
  public domain).
- No usable entry → `null`: one shared "unknown" bucket and no IP recorded, never a forged one.
- `client-ip.itest.ts` checks that forged entries don't pick the bucket.

## Audit trail integrity

- `appendAuditEvent` is the only writer. It takes a per-envelope `pg_advisory_xact_lock`, so `seq` is
  gap-free under concurrency, and it runs in the same transaction as the state change.
- `hash = sha256(prevHash + "\n" + canonicalJson(payload))`. `verifyAuditChain` detects edits,
  deletions and reordering. `GET /api/envelopes/:id/audit` returns `verification`.
- The chain head hash is printed on the certificate, so a later rewrite of the log is detectable
  against the PDF.
- **Append-only in the database** (migration `20260928180000_audit_append_only`, ADR 0010):
  - The api and worker connect as a login role in the group role **`sahihi_app`**. It has
    SELECT/INSERT/UPDATE/DELETE on every table, except no UPDATE, DELETE or TRUNCATE on
    `AuditEvent`, and nothing on `_prisma_migrations`. Default privileges extend this to tables that
    later migrations create.
  - A `BEFORE UPDATE` trigger (`AuditEvent_no_update`) refuses updates from **anyone**, the owner
    included.
  - `AuditEvent.recipientId` is `ON DELETE NO ACTION`, so audit rows are never rewritten by
    `SET NULL`, and a recipient with audit events can't be deleted on its own.
  - Deleting a whole organization still cascades through its envelopes and their audit events
    (FK actions run as the table owner). Retention and deletion rules are a separate roadmap item.
  - `apps/api/test/audit-append-only.itest.ts` checks all of the above with `SET LOCAL ROLE sahihi_app`.
- Setting up an environment (once per database cluster; the migration creates `sahihi_app`):
  ```sql
  CREATE ROLE sahihi_api LOGIN PASSWORD '…' IN ROLE sahihi_app;
  ```
  Then set `DATABASE_URL` (api, worker) to `sahihi_api`, and `MIGRATE_DATABASE_URL` (used by
  `prisma migrate deploy`, see `packages/db/prisma.config.ts`) to the owner. Locally both are the
  `sahihi` superuser, so the restrictions are only exercised by the integration test.
- Planned: periodic anchoring of chain heads (e.g. to an RFC 3161 timestamp authority).

## Webhooks

Owners and admins can send the org's envelope data to a URL of their choosing, so the
checks are strict (`docs/webhooks.md`, ADR 0013):

- **SSRF:** URLs must be `https://` with no credentials, and may not be `localhost`, `*.local`,
  `*.internal`, a single-label host or a private IP literal (`checkWebhookUrl`). Before **every**
  delivery, the worker resolves the host and refuses private, loopback, link-local (incl.
  `169.254.169.254`), CGNAT, multicast and reserved answers (`isPrivateAddress`). Redirects are not
  followed. `WEBHOOKS_ALLOW_PRIVATE_URLS=true` turns this off for local development and tests only.
  Residual risk: DNS rebinding between the check and the connection.
- **Signing:** `Sahihi-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")`. Receivers check it and
  reject timestamps older than 5 minutes.
- **Secrets:** generated server-side and shown once (create, rotate). They're stored AES-256-GCM
  encrypted with a key derived from `BETTER_AUTH_SECRET` (HKDF, own `info`). Responses carry only the
  last 4 characters. Rotating `BETTER_AUTH_SECRET` means rotating every webhook secret.
- **Payloads:** the tenant's own envelope data (titles, recipients' names/emails/statuses, hashes).
  Never signing tokens, OTPs or IP addresses.
- Response bodies are stored trimmed to 1,000 characters, for debugging.

## Documents

- The bucket is private. Every read or write uses a presigned URL (PUT for 5 minutes; GET short-lived
  with a `Content-Disposition` filename).
- Uploads are re-validated on the server (size, PDF parse, not encrypted). The original's SHA-256 is
  re-checked before stamping.
- Signature PNGs are validated as PNGs (magic bytes) and size-limited (≤ ~500 KB each, 8 MB per body).

## Consent & evidence (ESIGN / UETA / Kenya)

- Record exactly which consent text each signer agreed to. The wordings live in `CONSENT_TEXTS`
  (`packages/core/src/signing/consent.ts`), keyed by version, and `CONSENT_VERSION` is the one shown now.
  - The signing page submits the `consentVersion` it displayed. The API refuses an outdated one
    with 409 `consent_outdated` before storing anything, and the page reloads to show the current
    text.
  - The `recipient.consented` audit event (in the signing transaction) records
    `{ consentVersion, consentTextSha256 }`. The certificate shows both per signer ("Not recorded"
    for envelopes signed before versioning).
  - **Never edit a published wording in place.** Add a new version, point `CONSENT_VERSION` at it
    and keep the old entries. `consent.test.ts` pins every version's SHA-256, so an in-place edit
    fails CI. Wording changes need legal review.
- Per signer, we record: verification method, IP, user agent, viewed/consented/signed timestamps,
  and OTP events.
- Kenya: the Business Laws (Amendment) Act 2020 extended electronic signature recognition, and
  **advanced** electronic signatures require a licensed E-CSP (see `certificates.md`). Get legal
  sign-off on which document types v1 (INTERNAL) is suitable for before marketing.

## Data protection (Kenya DPA 2019 / GDPR)

- PII: sender and recipient names, emails, phones, IPs and user agents.
- Retention, export and deletion: `docs/data-retention.md` (ADR 0015). Purging keeps the evidence
  (hashes, certificate code, audit trail under the lawful-basis exception) and deletes files and
  personal data. Deleting a workspace also wipes its storage prefix.
- Planned: a DPA template for tenants, and data residency options.
- Don't put PII in logs. Log ids, not emails.

## Headers & transport

- **API:** `secureHeaders()`, and `Cache-Control: no-store` on every `/api/*` response (PII,
  presigned URLs, sessions) unless a handler sets its own.
- **Web, every page:** a **Content Security Policy** with a per-request nonce, built by
  `lib/csp.ts#buildCsp` in `proxy.ts` (ADR 0011):
  - `script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'`. No inline scripts, inline
    handlers or `javascript:` URLs; pdfium may compile wasm; React's `'unsafe-eval'` in dev only.
  - `style-src 'self' 'unsafe-inline'`, because Base UI and Extend set inline `style` attributes.
  - `connect-src 'self' https://cdn.jsdelivr.net <STORAGE_ORIGIN>`: the PDF engine's wasm and
    fallback fonts, and presigned upload/download URLs. `img-src` adds `blob: data:` and storage;
    `worker-src 'self' blob:`.
  - `frame-ancestors 'none'` (no clickjacking of Sign/Send/Void), `object-src 'none'`,
    except `/sign/<token>?embed=1` for an **embedded** recipient, which gets the workspace's allowed
    origins from an API lookup keyed by the token (docs/embedded-signing.md; any failure → `'none'`),
    `base-uri 'self'`, `form-action 'self'`, and `upgrade-insecure-requests` outside dev.
  - Next only puts nonces on dynamically rendered pages, so the root layout calls `connection()`.
  - `STORAGE_ORIGIN` (web env) is the S3 origin of presigned URLs. It defaults to local MinIO in dev,
    and `next.config.ts` refuses to build or start production without it.
- **Web baseline** (`next.config.ts`): `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` (`/sign/*`: `no-referrer`, `noindex`),
  `Permissions-Policy` (no camera, mic, geolocation or payment), HSTS, no `X-Powered-By`.
- Checked in a browser (signing page, field editor, `/verify`): zero violations, the PDF engine renders,
  and injected inline handlers and `javascript:` links are blocked.
- HTTPS everywhere in production. Cookies are `Secure` when `NODE_ENV=production`.

### Review of `/sign` and `/verify` (2026-09-28)

| Finding | Status |
|---|---|
| Rate limits and audit IPs came from the client-controlled left of `X-Forwarded-For` | Fixed (`TRUSTED_PROXY_HOPS`) |
| OTP attempt cap bypassable with parallel requests | Fixed (atomic claim) |
| `/api/sign` responses (PII, presigned URLs) cacheable | Fixed (`no-store` on `/api/*`) |
| Signing page could be framed (clickjacking) | Fixed (`frame-ancestors 'none'`) |
| No CSP | Fixed (above) |
| pdfium wasm and fallback fonts load from jsdelivr at runtime, without integrity checks, on the signing page | Open: self-host them (changes vendored `lib/pdf-thumbnail-utils.ts`, needs an ADR) |
| Token format checked before lookup, only hashes stored, 404 without detail, signer PII masked until OTP, `/verify` masks emails and `/verify/hash` never matches originals | OK |

## API keys

The public API (`/api/v1`, docs/public-api.md, ADR 0017) authenticates with workspace API keys:

- Stored as `sha256("api-key:" + key)` with a display hint; the raw key is shown once and never
  stored or logged. Revoked and expired keys get 401.
- Scoped: every `/api/v1` route declares its scope with `requireScope`. `organizationId` comes from
  the key row, and every lookup goes through `forOrganization`, so other workspaces' ids are 404.
- Only owners and admins (`api:manage`) create or revoke keys and set embed origins.
- Audit events from the API record the key's creator as the actor plus `{ via: "api", apiKeyId }`.
- Embedded signing URLs are single-use-in-effect: each request rotates the token (30 min TTL).

## Checklist for any new route

- [ ] Behind `requireOrg` (sender) or `withSigner` + `rateLimit` (public)
- [ ] Body validated with a zod schema via `parseJson`
- [ ] Tenant-scoped lookups (`forOrganization`), and 404 for anything out of scope
- [ ] Role checked after the lookup: `assertCanManageEnvelope` / `assertCanDeleteDocument`
      (`apps/api/src/lib/permissions.ts`), or `hasPermission` from `@sahihi/core` for new actions.
      403 `forbidden` only for rows the caller's org owns, so other orgs still get a 404
- [ ] State change via `assertTransition` + `appendAuditEvent` in the same transaction
- [ ] Jobs enqueued after commit, IDs only
- [ ] Response contains no token hashes, OTP hashes or other recipients' PII
