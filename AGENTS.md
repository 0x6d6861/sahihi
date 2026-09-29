# AGENTS.md — Sahihi

Guide for coding agents (Claude Code, Codex, Cursor, …) and humans working in this repo.
Read this file first, then the doc for the area you're touching (see **Doc map**).

## What this is

**Sahihi** is a multi-tenant e-signature SaaS in the style of DocuSign:

1. A sender (SaaS user, org member) uploads a **PDF** (a `Document`).
2. They create an **Envelope**: add recipients, then place **signing fields** on the pages.
3. They send the envelope. Each recipient gets a **unique signing link** (`/sign/<token>`).
4. Recipients sign in the browser (optionally with an email/SMS OTP step).
5. When everyone has signed, the worker **stamps the values into the PDF on the server**,
   hashes the result and issues a **Certificate of Completion** with a public `/verify` page.
6. Later, a licensed **Certification Authority** plugs in behind the `SigningProvider`
   interface to add a real PAdES digital signature.

## Stack

| Layer | Choice |
|---|---|
| Runtime / package manager | **Bun 1.3** workspaces (`bun install`, `bun test`) |
| API | **Hono** on Bun — `apps/api` |
| Jobs | **BullMQ** + Redis — `apps/worker` |
| Web | **Next.js 16** App Router, React 19, Tailwind v4 — `apps/web` |
| UI | **coss ui** (Base UI + shadcn registry) and **Extend UI** document components. **Defaults only** — see UI rules |
| Auth | **better-auth** + Organization plugin (senders only) |
| DB | PostgreSQL + **Prisma 7** (`prisma-client` generator, `@prisma/adapter-pg`) |
| PDF | **pdf-lib** (server-side stamping, certificate rendering) |
| Storage | S3-compatible (MinIO locally), presigned URLs only |
| Email / SMS | **React Email** templates in `packages/emails` (preview: `bun run emails:dev`), SMTP→Mailpit in dev, Postmark in prod / Africa's Talking for SMS OTP |
| Lint / format | **Biome** |
| Deploy target | Railway (api, worker, web as 3 services + Postgres + Redis) |

## Repo map

```
apps/
  api/        Hono REST API. routes/{documents,envelopes,templates,webhooks,billing,data,signing,verify}.ts, auth.ts (better-auth)
  worker/     BullMQ consumers: notifications, envelope finalize, webhooks, maintenance (expire/remind/sweeps/retention/exports)
  web/        Next.js. (auth)/ sign-in/up/onboarding, (app)/ documents+envelopes, sign/[token], verify/[code]
packages/
  config/     Env schema (zod) + queue names. The ONLY place process.env is parsed.
  core/       Pure domain logic, no I/O: enums, state machines, routing, coordinates, crypto, audit chain, zod schemas
  db/         Prisma schema + client, tenant scoping, appendAuditEvent, issueSigningLink
  infra/      S3 storage + typed BullMQ queues + Redis
  pdf/        inspectPdf, stampFields, renderCertificate (pdf-lib)
  emails/     React Email templates → { subject, html, text }; preview server (see its README)
docs/         Design docs, roadmap, ADRs  ← read before changing an area
scripts/      bootstrap-ui.sh (installs coss + Extend components)
.claude/      Slash commands for Claude Code
```

Dependency direction (never import "upwards"):
`core` ← `config` ← `db`, `infra`, `pdf` ← `api`, `worker`. `emails` is a leaf (React Email only,
no internal deps) used by `worker`. `web` may import **only** `@sahihi/core` (types, enums, zod
schemas, coordinate helpers). It must never import `db`, `infra`, `pdf`, `emails` or `config`.

## Commands

```bash
bun install
bun run infra:up           # postgres, redis, minio (+bucket), mailpit (http://localhost:8025)
cp .env.example .env
bun run db:generate        # prisma client → packages/db/src/generated (gitignored)
bun run db:migrate         # prisma migrate dev
bun run ui:bootstrap       # ONE-TIME: install coss + Extend components into apps/web (needs internet)
bun run dev                # api :4000, worker, web :3000

bun test                   # unit tests (no DB/Redis needed)
bun run test:integration   # API integration tests (needs infra:up; uses sahihi_test DB)
bun run test:e2e           # Playwright journey on its own stack (needs infra:up, dev stopped; docs/testing.md → E2E)
bun run fixtures           # regenerate fixtures/*.pdf (commit them; tests check they match)
bun run emails:dev         # React Email preview of every template → http://localhost:3030
bun run billing:set-plan <org-slug> <plan>   # change a workspace's plan (docs/billing.md)
bun run typecheck          # all workspaces
bun run lint               # biome check
```

**Definition of done** for any change: `bun test`, `bun run typecheck` and `bun run lint` all pass,
the relevant doc in `docs/` is updated if behaviour changed, and the matching checkbox in
`docs/roadmap.md` is ticked.

## Golden rules (non-negotiable)

### UI — defaults only
1. Use **only** components installed from the coss registry (`@coss/*`) and the Extend registry
   (`@extend/*`) via `bun run ui:bootstrap` / `bunx shadcn@latest add …`. **Do not hand-write
   primitives** (no custom Button/Dialog/Input), and don't install another UI kit (no Radix, MUI, Mantine,
   Headless UI, react-pdf, etc.).
2. **Never edit files under `apps/web/components/ui/`** (or wherever the Extend CLI put its files).
   They're vendored registry output. Put composition in `apps/web/components/app/` and page folders.
   If a vendored component really must change, write an ADR in `docs/decisions/` first.
3. coss is **Base UI**, not Radix. Use `render={<Link …/>}` for polymorphism, **not** `asChild`.
   Card body is `CardPanel`. Check the real props in `components/ui/<name>.tsx` before using them.
4. Style with Tailwind **theme tokens only** (`bg-background`, `text-muted-foreground`, `border-info`, …).
   No hex colours and no arbitrary colour values. Full rules are in `docs/ui.md`.

### Data & security
5. **Tenant isolation:** every query on a tenant-owned model in an authenticated route goes through
   `forOrganization(orgId)` from `@sahihi/db` (or filters by `organizationId` explicitly). Routes sit
   behind `requireOrg`. See `docs/security.md`.
6. **State changes go through `assertTransition()`** (`packages/core/src/envelope-state.ts`). No other
   code may decide whether a status change is legal.
7. **Audit:** every state change writes an audit event with `appendAuditEvent(tx, …)` **inside the
   same `prisma.$transaction`**. Never update or delete `AuditEvent` rows (the database refuses:
   the `sahihi_app` role and an update trigger, ADR 0010). New event types go in `AUDIT_EVENT_TYPES`.
8. **Secrets:** raw signing tokens and OTP codes are never stored or logged. Store only hashes
   (`hashSigningToken`, `hashOtp`). A raw token exists only in a notification job payload and the email.
9. **The server owns final PDFs:** the browser submits field values only. Stamping, flattening and
   hashing happen in the worker (`@sahihi/pdf`). Original PDFs are immutable once `READY`.
10. **Coordinates:** `Field.x/y/width/height` are **normalized 0–1, top-left origin, relative to the
    page as displayed**. Convert only with `@sahihi/core` helpers. Read `docs/coordinates.md`.
11. **Enqueue after commit:** add BullMQ jobs *after* the transaction resolves. Job payloads carry IDs
    (plus the raw token for invites) and nothing else. Workers re-read state and must be idempotent.
    Webhook events are written **inside** the transaction with `queueEnvelopeWebhook(tx, …)` (outbox)
    and enqueued after it with `enqueueWebhookDeliveries(ids)`.
12. **Public routes** (`/api/sign/*`, `/api/verify/*`) must be rate-limited (`rateLimit()`) and must
    never return token hashes, other recipients' PII or data from another envelope.

### Code conventions
13. Validate every request body with a zod schema from `@sahihi/core/schemas` via `parseJson()`.
    Shared schemas live in core so web forms and the API agree.
14. Env vars: add them to `packages/config/src/index.ts` **and** `.env.example`. Never read
    `process.env` elsewhere, with two exceptions: `apps/web` for `API_URL`, `STORAGE_ORIGIN` and
    `NODE_ENV`, and
    `packages/db/prisma.config.ts` for `MIGRATE_DATABASE_URL` / `DATABASE_URL`.
15. Prisma enums must mirror the unions in `packages/core/src/enums.ts`. `packages/db/src/enums.test.ts`
    enforces this, so update both.
16. When you change better-auth plugins, run `bun run auth:schema` and reconcile section 1 of
    `schema.prisma` by hand.
17. Pure logic goes in `packages/core` with a `*.test.ts` next to it. Keep route handlers thin.
18. Don't add dependencies casually. Pin exact versions (the repo uses exact pins).

## Doc map — read before you touch

| If you're working on… | Read |
|---|---|
| Anything (first time) | `docs/architecture.md`, `docs/roadmap.md` |
| Sign-up, sessions, orgs, invitations | `docs/auth.md` |
| Field editor, signing page, stamping maths | `docs/coordinates.md` |
| Upload, stamping, finalize job | `docs/pdf-pipeline.md` |
| Send / sign / decline / void / reminders / OTP | `docs/signing-flow.md` |
| Templates (save as / use) | `docs/templates.md` |
| Webhooks (events, signing, delivery) | `docs/webhooks.md` |
| Plans, envelope quotas, seats | `docs/billing.md` |
| Retention, export, deleting data or a workspace | `docs/data-retention.md` |
| Certificates, `/verify`, CA integration | `docs/certificates.md` |
| Any public route, tokens, tenancy | `docs/security.md` |
| Any screen or component | `docs/ui.md` |
| Writing tests | `docs/testing.md` |
| Why things are the way they are | `docs/decisions/` |

## Workflow for agents

1. Pick the **first unchecked item** in `docs/roadmap.md` (or the one you were asked to do).
   Code has `TODO(roadmap Pn)` markers where the work plugs in.
2. Read the linked docs. Look at existing code in the same area and follow its patterns.
3. Make a small, focused change and add or adjust tests.
4. Run `bun test && bun run typecheck && bun run lint`.
5. Tick the roadmap checkbox and update docs if behaviour changed.
6. If you made a non-obvious design choice, add an ADR (`docs/decisions/NNNN-title.md`, see the template).

## Gotchas

- **Prisma 7:** the client is generated into `packages/db/src/generated/prisma` (gitignored). Import
  from `@sahihi/db`, never from `@prisma/client`. Run `bun run db:generate` after schema edits.
- **Next 16:** middleware is now `proxy.ts` (exported `proxy` function). It's only an optimistic cookie
  check; the API re-validates everything.
- **Same-origin API:** the browser calls `/api/*` on the web origin and Next rewrites the request to
  the Hono API. That's why `BETTER_AUTH_URL` points at the **web** origin. Server Components use
  `lib/api-server.ts`, which forwards cookies.
- **coss ≠ shadcn/Radix:** prop names differ (`render`, `CardPanel`, `Form` with `errors`, `toastManager`).
  Open the installed source before guessing.
- **Extend blocks are demos:** `ESignatureBlock` only takes `file` and builds the PDF in the browser.
  Build the field editor on `PDFEditor` in view-only mode (`renderPageOverlay`) + `lib/field-geometry.ts`,
  and the signing page on the lighter `PDFViewer`. Never use `PDFEditor`'s sign or forms modes for
  envelope fields. See ADR 0006 and `docs/ui.md` → PDFEditor configurations.
- `bun test` is the test runner (not vitest/jest). Web tests must stay DOM-free (pure helpers only).
- Registry installs need internet access to `coss.com`, `www.extend.ai` and `ui.shadcn.com`.
