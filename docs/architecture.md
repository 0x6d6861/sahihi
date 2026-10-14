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
| `@sahihi/infra` | Storage (`storageFor`, `userStorage`, `releaseObject`, `keys`), typed queues, Redis | config |
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
Organization 1─* GeneratedDocument          drafted with the AI assistant (docs/ai-documents.md)
GeneratedDocument 1─* GeneratedDocumentVersion   immutable content versions
GeneratedDocument 0..1─1 Document, Envelope set when finalised
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
| GET/PUT | `/api/generated-documents/settings` | org | AI assistant availability; owners and admins switch it |
| GET/POST | `/api/generated-documents` · `/:id` · `/:id/preview` | org + assistant | List / start from a starter / detail / PDF preview (docs/ai-documents.md) |
| POST | `/api/generated-documents/:id/chat` | org + assistant | One assistant turn (UI message stream) |
| POST/PUT | `/api/generated-documents/:id/variables` · `/:id/roles` · `/:id/content` | org + assistant | Fill blanks, set signers, save edited text (new version each) |
| POST | `/api/generated-documents/:id/proposals/:pid/accept` · `/reject` | org + assistant | Apply (new version) or reject an assistant proposal |
| POST | `/api/generated-documents/:id/finalize` | org + assistant | READY document + DRAFT envelope |
| * | `/api/v1/*` | API key + scope | Public API, see docs/public-api.md |

## Queues & jobs

Typed contracts: `packages/infra/src/queues.ts`. Consumers: `apps/worker/src/index.ts`.

| Queue | Jobs | Notes |
|---|---|---|
| `notifications` | `auth.*`, `envelope.invite/reminder/completed/declined/voided`, `recipient.otp` | concurrency 10, 5 attempts exp. backoff |
| `envelope-finalize` | `envelope.finalize` | `jobId: finalize-<envelopeId>` dedupes (BullMQ ids may not contain `:`); concurrency 2 |
| `maintenance` | `envelopes.expire` (hourly :05), `envelopes.remind` (09:00 Africa/Nairobi), `documents.sweep-uploads` (every 15 min), `notifications.cleanup` (02:50 Africa/Nairobi, docs/notifications.md), `bulk.send` (on demand, `jobId: bulk-<id>`) | job schedulers upserted at worker boot |

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

Private bucket. The browser only ever sees short-lived presigned URLs, or, for files in a
workspace's own bucket, tickets to our own origin (docs/storage.md). Key layout
(`packages/infra/src/storage/keys.ts` → `keys`; `-{v}` is a version new on every write, below):

```
org/{orgId}/documents/{documentId}/original.pdf
org/{orgId}/documents/{documentId}/thumbnail-{v}.png   (first page for the grid, ADR 0033)
org/{orgId}/envelopes/{envelopeId}/fields/{fieldId}-{v}.png
org/{orgId}/envelopes/{envelopeId}/signed.pdf            (single-document envelopes signed before ADR 0037)
org/{orgId}/envelopes/{envelopeId}/signed/{envelopeDocumentId}-{v}.pdf
org/{orgId}/envelopes/{envelopeId}/attachments/{attachmentId}   (supporting files, ADR 0037)
org/{orgId}/envelopes/{envelopeId}/bundle-{v}.zip        ("Download all")
org/{orgId}/templates/{templateId}/attachments/{attachmentId}
org/{orgId}/envelopes/{envelopeId}/certificate-{v}.pdf
org/{orgId}/exports/{exportId}-{v}.zip
org/{orgId}/branding/logo-{version}.png      (public via /api/branding, docs/auth.md → Logos)
user/{userId}/{signature|initials}-{version}.png   (saved signature, not workspace data)
user/{userId}/avatar-{version}.png               (profile picture, via /api/avatars)
staging/org/{orgId}/…                            (uploads waiting for validation, own storage only)
```

Keys stored before versions keep their old, unversioned form.

Objects are write-once. `original.pdf` is never overwritten, because its SHA-256 is on the
certificate, and every key a job or request can write twice carries a version (`objectVersion()`),
so a retry writes a new object instead of replacing one.

Code reaches storage through a driver (ADR 0051), never the S3 client:
- `storageFor(orgId)` for a workspace's files (`org/{orgId}/…`): Sahihi's bucket, or the
  workspace's own with primary storage (docs/storage.md). Resolved per call through the registry
  the api, worker and test preload pass to `configureStorage`.
- `userStorage()` for a person's own files (`user/{userId}/…`), which always stay in Sahihi's bucket.
- `releaseObject(orgId, key, reason)` / `releasePrefix(…)` when a workspace file is no longer
  needed. Sahihi's bucket deletes it; a customer's bucket keeps it and logs it as released, because
  Sahihi never deletes there. Only Sahihi's driver (`DeletableStorage`) has `delete`.
- Browser uploads go `presignUpload` → `uploaded` / `readUpload` (validate) → `commitUpload` or
  `discardUpload`, so a rejected upload never reaches a customer's bucket.
- `platformStorage()` is Sahihi's bucket itself, for tests that check what it holds.

## Configuration

All server env vars are declared in `packages/config/src/index.ts` (validated at boot, so the
process fails fast) and documented in `.env.example`.

## Deployment

Railway: four services (api, worker, web, website) from the monorepo plus managed Postgres and Redis.
The website is the marketing site: no database and no server-side logic. Its one setting is
`API_URL` (the api's internal URL), used only by the `/api/verify/*` rewrite behind its public
`/verify` pages, so set it on the website service too (build and start).
The api service runs `prisma migrate deploy` before starting, as the schema owner
(`MIGRATE_DATABASE_URL`). The api and worker themselves connect with `DATABASE_URL` as a login role
in `sahihi_app`, which can't run DDL or rewrite the audit trail (see `security.md`). Set `WEB_URL`, `API_URL` and
`BETTER_AUTH_URL` (= web origin) per environment. The web service needs `API_URL` for the rewrite.
Workers scale horizontally. The finalize job is deduped by `jobId`, and audit writes are serialised
with a Postgres advisory lock. The worker needs LibreOffice and Word-compatible fonts for Word
uploads (docs/pdf-pipeline.md → Word uploads, ADR 0052).
