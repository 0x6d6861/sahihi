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
- Planned (roadmap P5): an integration test that creates two orgs and hits every route cross-tenant,
  plus Postgres row-level security as defence in depth.

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
- On success, a signed httpOnly cookie (HMAC keyed from `BETTER_AUTH_SECRET`) scoped to `/api/sign`
  for 30 minutes and bound to the recipient id.

## Rate limiting

`rateLimit({ bucket, limit, windowSec, key? })` is a Redis fixed window. Current limits:

| Route | Limit |
|---|---|
| `/api/sign/:token*` | 120 / min / IP |
| `/api/sign/:token/otp` | 5 / 15 min / token |
| `/api/verify/*` | 30 / min / IP |

better-auth applies its own limits to `/api/auth/*`. Behind Railway's proxy, `x-forwarded-for[0]`
is the client IP. If you add another proxy hop, revisit `clientMeta()`.

## Audit trail integrity

- `appendAuditEvent` is the only writer. It takes a per-envelope `pg_advisory_xact_lock`, so `seq` is
  gap-free under concurrency, and it runs in the same transaction as the state change.
- `hash = sha256(prevHash + "\n" + canonicalJson(payload))`. `verifyAuditChain` detects edits,
  deletions and reordering. `GET /api/envelopes/:id/audit` returns `verification`.
- The chain head hash is printed on the certificate, so a later rewrite of the log is detectable
  against the PDF.
- Hardening (roadmap P5): a DB role for the app without `UPDATE`/`DELETE` on `AuditEvent`, and
  periodic anchoring of chain heads (e.g. to an RFC 3161 timestamp authority).

## Documents

- The bucket is private. Every read or write uses a presigned URL (PUT for 5 minutes; GET short-lived
  with a `Content-Disposition` filename).
- Uploads are re-validated on the server (size, PDF parse, not encrypted). The original's SHA-256 is
  re-checked before stamping.
- Signature PNGs are validated as PNGs (magic bytes) and size-limited (≤ ~500 KB each, 8 MB per body).

## Consent & evidence (ESIGN / UETA / Kenya)

- Record exactly which consent text each signer agreed to. The wordings live in `CONSENT_TEXTS`
  (`packages/core/src/consent.ts`), keyed by version, and `CONSENT_VERSION` is the one shown now.
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
- Planned: per-org retention settings, an export and delete tool (the audit trail is retained
  under a lawful-basis exception), a DPA template for tenants, and data residency options.
- Don't put PII in logs. Log ids, not emails.

## Headers & transport

`secureHeaders()` on the API. Next sets its own headers, and a CSP should be added once the Extend
viewer's worker and wasm needs are known (roadmap P5). HTTPS everywhere in production. Cookies are
`Secure` when `NODE_ENV=production`.

## Checklist for any new route

- [ ] Behind `requireOrg` (sender) or `withSigner` + `rateLimit` (public)
- [ ] Body validated with a zod schema via `parseJson`
- [ ] Tenant-scoped lookups (`forOrganization`), and 404 for anything out of scope
- [ ] State change via `assertTransition` + `appendAuditEvent` in the same transaction
- [ ] Jobs enqueued after commit, IDs only
- [ ] Response contains no token hashes, OTP hashes or other recipients' PII
