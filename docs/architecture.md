# Architecture

## System overview

```
                ┌──────────────────────────── browser ────────────────────────────┐
                │  Next.js (apps/web)                                              │
                │  /documents /envelopes (sender, better-auth session)             │
                │  /sign/[token] (recipient, token)   /verify/[code] (public)      │
                └──────────────┬───────────────────────────────┬───────────────────┘
                               │ same-origin /api/* (rewrite)   │ PUT bytes / GET files
                               ▼                                 ▼ (presigned URLs)
┌───────────────┐   ┌──────────────────────┐   jobs   ┌──────────────────┐   ┌───────────┐
│  PostgreSQL   │◀──│  Hono API (apps/api) │─────────▶│ BullMQ (Redis)   │   │ S3 bucket │
│  (Prisma 7)   │   │  better-auth         │          └────────┬─────────┘   │ (private) │
└───────▲───────┘   └──────────────────────┘                   ▼             └─────▲─────┘
        │                                         ┌──────────────────────────┐    │
        └─────────────────────────────────────────│ Worker (apps/worker)     │────┘
                                                  │ notifications · finalize │──▶ Postmark / SMTP
                                                  │ maintenance (cron)       │──▶ Africa's Talking
                                                  └──────────────────────────┘
```

- **Web** renders UI and talks only to the API. It never touches the DB, S3 credentials or queues.
- **API** owns validation, authorization, state transitions, and the audit trail. It hands slow or
  unreliable work to queues.
- **Worker** does email/SMS, PDF finalization and certificate generation, and scheduled
  maintenance. Every job is idempotent and re-reads state from the DB.

## Packages

| Package | Responsibility | May import |
|---|---|---|
| `@sahihi/core` | Pure domain logic: enums, state machines, routing, coordinates, crypto, audit chain, zod schemas. No I/O. Runs in the browser too. | zod |
| `@sahihi/config` | Env parsing (`getEnv()`), queue names | core |
| `@sahihi/db` | Prisma client, `forOrganization`, `appendAuditEvent`, `issueSigningLink` | core |
| `@sahihi/infra` | S3 (`presignUpload`, `putObject`, …, `keys`), typed queues, Redis | config |
| `@sahihi/pdf` | `inspectPdf`, `stampFields`, `renderCertificate` (pdf-lib, server only) | core |
| `apps/api` | HTTP | all packages |
| `apps/worker` | Jobs | all packages |
| `apps/web` | UI | **core only** |

## Domain model

```
Organization 1─* Member *─1 User            (better-auth)
Organization 1─* Document                   uploaded PDF, immutable once READY
Document 0..1─* Document                    sourceDocumentId: "prepared" copies (lineage only)
Organization 1─* Envelope *─1 Document      a signing request
Envelope 1─* Recipient 1─* Field            fields are owned by one recipient
Envelope 1─* AuditEvent                     append-only, hash-chained
Envelope 1─1 Certificate                    issued on completion
Recipient 1─* RecipientOtp                  email/SMS codes (hashed)
```

See `packages/db/prisma/schema.prisma`. The schema comments are part of the spec.

### Status machines

The only source of truth is `packages/core/src/envelope/envelope-state.ts`.

```
Envelope:  DRAFT → SENT → IN_PROGRESS → COMPLETED
                     └──────┴──→ DECLINED | VOIDED | EXPIRED        (terminal)
Recipient: PENDING → SENT → VIEWED → SIGNED | DECLINED
Document:  UPLOADING → READY | FAILED
```

- Recipients and fields can only be edited while the envelope is `DRAFT` (`isEditable`).
- Routing (who may act now) lives in `packages/core/src/envelope/routing.ts`. `PARALLEL` activates everyone;
  `SEQUENTIAL` activates the lowest `order` still pending, and equal orders sign in parallel.
- `VIEWER` recipients (CC) never have fields and don't block completion.

## Request lifecycle (API)

1. `logger` → `secureHeaders` → CORS (`WEB_URL` only) → 8 MB body limit
2. `/api/auth/*` → better-auth handler
3. `/api/documents`, `/api/envelopes` → `requireOrg` (session + active org + membership)
4. `/api/sign/:token/*` → `rateLimit` → `withSigner` (token → recipient) → `requireReady` (state + OTP)
5. Handler: `parseJson(zodSchema)` → load with `forOrganization` → `assertTransition` →
   `prisma.$transaction` { update + `appendAuditEvent` } → enqueue jobs **after commit**
6. Errors: `HTTPException` → its status; `InvalidTransitionError` → 409 `invalid_state`; anything
   else → 500 `internal_error` (logged).

Error body shape: `{ error: string, message?: string, issues?: {path, message}[] }`.

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/documents/uploads` | org | Create `Document(UPLOADING)`, return presigned PUT |
| POST | `/api/documents/:id/complete` | org | Server downloads, validates, hashes → `READY`/`FAILED` |
| GET | `/api/documents` · `/:id` · `/:id/file` | org | List / detail / presigned GET |
| DELETE | `/api/documents/:id` | org | Soft delete |
| POST | `/api/envelopes` | org | Create draft |
| GET | `/api/envelopes` · `/:id` | org | List / detail (no token hashes) |
| PUT | `/api/envelopes/:id/document` | org | Switch a draft to another READY document; removes fields, audited (ADR 0024) |
| PUT | `/api/envelopes/:id/details` | org | Title, message, signing order, expiry (draft) |
| PUT | `/api/envelopes/:id/recipients` | org | Replace recipient list (draft) |
| PUT | `/api/envelopes/:id/fields` | org | Replace all fields (editor autosave, draft) |
| POST | `/api/envelopes/:id/send` | org | Preflight → `SENT`, issue links |
| POST | `/api/envelopes/:id/void` | org | Void with reason |
| POST | `/api/envelopes/:id/recipients/:rid/remind` | org | Rotate link + resend |
| GET | `/api/envelopes/:id/audit` | org | Events + chain verification |
| GET | `/api/envelopes/:id/downloads` | org | Signed PDF + certificate URLs |
| GET | `/api/sign/:token` | token | Signing session (state, fields if verified) |
| POST | `/api/sign/:token/otp` · `/otp/verify` | token | Send / verify OTP |
| GET | `/api/sign/:token/file` | token+ready | Presigned original PDF, marks viewed |
| POST | `/api/sign/:token/submit` · `/decline` | token+ready | Sign / decline |
| GET | `/api/sign/:token/downloads` | token | After completion |
| GET | `/api/verify/:code` | public | Certificate lookup |
| POST | `/api/verify/hash` | public | Is this SHA-256 a document we issued? |
| GET/POST/DELETE | `/api/api-keys` · `/:id` | org (`api:manage`) | List / create (key shown once) / revoke API keys |
| GET/PUT | `/api/embedding` | org (`api:manage`) | Allowed origins for embedded signing |
| POST | `/api/templates/:id/bulk-sends` | org | Start a bulk send (docs/bulk-send.md) |
| GET | `/api/bulk-sends` · `/:id` | org | Batches / progress per row |
| GET | `/api/sign/:token/embed` | token | Frame policy for `?embed=1` (read by `proxy.ts`) |
| * | `/api/v1/*` | API key + scope | Public API, see docs/public-api.md |

## Queues & jobs

Typed contracts: `packages/infra/src/queues.ts`. Consumers: `apps/worker/src/index.ts`.

| Queue | Jobs | Notes |
|---|---|---|
| `notifications` | `auth.*`, `envelope.invite/reminder/completed/declined/voided`, `recipient.otp` | concurrency 10, 5 attempts exp. backoff |
| `envelope-finalize` | `envelope.finalize` | `jobId: finalize-<envelopeId>` dedupes (BullMQ ids may not contain `:`); concurrency 2 |
| `maintenance` | `envelopes.expire` (hourly :05), `envelopes.remind` (09:00 Africa/Nairobi), `documents.sweep-uploads` (every 15 min), `bulk.send` (on demand, `jobId: bulk-<id>`) | job schedulers upserted at worker boot |

### Emails

Templates live in their own package, **`@sahihi/emails`** (`packages/emails`, see its README). Each
email is a React Email component in `src/templates/` with its subject and `PreviewProps`, and
`src/index.ts` exposes one function per email returning `{ subject, html, text }` for the worker.
Preview them all with `bun run emails:dev` (http://localhost:3030).
- The plain-text part is rendered from the same component (`render(…, { plainText: true })`, headings
  left in their original case), so HTML and text never drift apart.
- React escapes every interpolated value. Titles, messages and names are user input, and
  `templates.test.ts` checks that injected markup comes out escaped.
- **Org branding** applies to emails sent on an organization's behalf (invite, reminder, completed,
  declined, voided). The org's logo appears only if `Organization.logo` is an absolute `https://`
  URL (`safeLogoUrl` in `brand.ts`); otherwise the org name is used. The footer reads "Sent via Sahihi
  on behalf of {org}". Auth and OTP emails are Sahihi-branded.
- **Reply-To** is the envelope's sender on emails sent to recipients, so replies reach a person.
- Styles are inline with a fixed neutral palette (email clients ignore stylesheets and theme tokens).
- To check an email end to end, trigger it in the app and open Mailpit (http://localhost:8025).
  Its HTML Check tab shows client compatibility.

## Storage

Private bucket. The browser only ever sees short-lived presigned URLs. Key layout
(`packages/infra/src/storage.ts` → `keys`):

```
org/{orgId}/documents/{documentId}/original.pdf
org/{orgId}/envelopes/{envelopeId}/fields/{fieldId}.png
org/{orgId}/envelopes/{envelopeId}/signed.pdf
org/{orgId}/envelopes/{envelopeId}/certificate.pdf
org/{orgId}/exports/{exportId}.zip
org/{orgId}/branding/logo-{version}.png      (public via /api/branding, docs/auth.md → Logos)
user/{userId}/{signature|initials}-{version}.png   (saved signature, not workspace data)
user/{userId}/avatar-{version}.png               (profile picture, via /api/avatars)
```

Objects are write-once. `original.pdf` is never overwritten, because its SHA-256 is on the certificate.

## Configuration

All server env vars are declared in `packages/config/src/index.ts` (validated at boot, so the
process fails fast) and documented in `.env.example`.

## Deployment

Railway: three services (api, worker, web) from the monorepo plus managed Postgres and Redis.
The api service runs `prisma migrate deploy` before starting, as the schema owner
(`MIGRATE_DATABASE_URL`). The api and worker themselves connect with `DATABASE_URL` as a login role
in `sahihi_app`, which can't run DDL or rewrite the audit trail (see `security.md`). Set `WEB_URL`, `API_URL` and
`BETTER_AUTH_URL` (= web origin) per environment. The web service needs `API_URL` for the rewrite.
Workers scale horizontally. The finalize job is deduped by `jobId`, and audit writes are serialised
with a Postgres advisory lock.
