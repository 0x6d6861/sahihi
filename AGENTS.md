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
| UI | **Arc** (`@uiarc/*`, CSS modules + Motion) for primitives and the design tokens, **coss ui** (Base UI) where Arc has no equivalent, **Extend UI** document components, **shadcn/ui** (`base-nova`) as fallback. Light + dark. **Defaults only**, see UI rules and ADR 0023 |
| Auth | **better-auth** + Organization plugin (senders only) |
| DB | PostgreSQL + **Prisma 7** (`prisma-client` generator, `@prisma/adapter-pg`) |
| PDF | **pdf-lib** (server-side stamping, certificate rendering), **PDFium WASM** (`@embedpdf/pdfium`, text extraction for field detection) |
| Storage | S3-compatible (MinIO locally), presigned URLs only |
| Email / SMS | **React Email** templates in `packages/emails` (preview: `bun run emails:dev`), SMTP→Mailpit in dev, Postmark in prod / Africa's Talking for SMS OTP |
| Lint / format | **Biome** |
| Deploy target | Railway (api, worker, web as 3 services + Postgres + Redis) |

## Repo map

```
apps/
  api/        Hono REST API. routes/{documents,envelopes,templates,webhooks,billing,data,signing,verify}.ts, v1.ts (public API,
              API keys), api-keys/embedding/bulk-sends.ts, auth.ts (better-auth)
  worker/     BullMQ consumers: notifications, envelope finalize, webhooks, maintenance (expire/remind/sweeps/retention/exports)
  web/        Next.js. (auth)/ sign-in/up/onboarding, (app)/ documents+envelopes+templates+bulk-sends+settings,
              sign/[token], verify/[code]
  e2e/        Playwright journey on its own stack (api :4100, web :3100, worker, DB sahihi_e2e; docs/testing.md)
packages/
  config/     Env schema (zod) + queue names. The ONLY place process.env is parsed.
  core/       Pure domain logic, no I/O, one folder per domain under src/: envelope/ (state machine, routing),
              field-detection/, geometry/ (coordinates), integrations/ (API keys, webhooks, embed),
              security/ (crypto, audit chain), shared/ (enums, zod schemas), signing/, templates/,
              workspace/ (billing, members, permissions, retention). Import only from `@sahihi/core`
  db/         Prisma schema + client, tenant scoping, appendAuditEvent, issueSigningLink
  envelopes/  Envelope services shared by api + worker: send, void, create (document/template), routing,
              bulk send, embedded links. Throws EnvelopeError (mapped to HTTP in app.onError)
  infra/      S3 storage + typed BullMQ queues + Redis
  pdf/        src/parse/ (inspectPdf, readFormWidgets, readPageText), src/render/ (stampFields, renderCertificate),
              src/text/ (Noto fonts, text fitting), src/fixtures/ (test PDF builders)
  emails/     React Email templates → { subject, html, text }; preview server (see its README)
docs/         Design docs, roadmap, ADRs  ← read before changing an area
scripts/      bootstrap-ui.sh (installs coss + Extend components; Arc lives in components/arc, see /add-ui)
.claude/      Slash commands for Claude Code
```

Dependency direction (never import "upwards"):
`core` ← `config` ← `db`, `infra`, `pdf` ← `envelopes` ← `api`, `worker`. `emails` is a leaf (React Email only,
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
1. Use **only** registry components, in this order (ADR 0023): **Arc** (`@uiarc/*`) for every
   primitive it ships (button, inputs, select, checkbox, switch, dialog, drawer, popover, tooltip,
   tabs, dropdown menus, alert, badge, empty state, toasts…), **coss** (`@coss/*`) where Arc has
   nothing (table, sidebar, icon-only buttons…), **Extend** (`@extend/*`) for document/PDF UI, and
   **shadcn/ui as the last fallback**. Install Arc with the style swap in `/add-ui`, never with a
   plain `shadcn add` (the `base-nova` transform breaks Arc's Radix files). Never let an install
   overwrite a coss/Extend/Arc file. **Do not hand-write primitives**, and don't install another UI
   kit (no MUI, Mantine, Headless UI, react-pdf, etc.). Radix is allowed **only** as a dependency of
   vendored Arc items; app code never imports Radix.
2. **Never edit files under `apps/web/components/ui/`, `components/arc/`** (or wherever the Extend
   CLI put its files). They're vendored registry output. Put composition in `apps/web/components/app/`
   and page folders (`Panel`, `ButtonLink`, `ConfirmDialog` already exist). If a vendored component
   really must change, write an ADR in `docs/decisions/` first.
3. **Arc is Radix** (`asChild` on triggers, Arc's own props like `label`/`error`/`tone`/`options`);
   **coss is Base UI** (`render={<Link …/>}`, `CardPanel`). Open the installed file
   (`components/arc/<id>/<id>.tsx` or `components/ui/<name>.tsx`) before using it. Arc's CSS
   modules beat Tailwind utilities on the same property, so wrap an Arc component to hide or place it.
4. Style with **theme tokens only** (`bg-background`, `text-muted-foreground`, `border-info`, …; Arc
   tokens like `var(--font-mono)` in an inline `style` when a utility can't reach an Arc element).
   No hex colours and no arbitrary colour values. Every screen must work in light and dark. Full
   rules are in `docs/ui.md`.

### Data & security
5. **Tenant isolation:** every query on a tenant-owned model in an authenticated route goes through
   `forOrganization(orgId)` from `@sahihi/db` (or filters by `organizationId` explicitly). Routes sit
   behind `requireOrg`. See `docs/security.md`.
6. **State changes go through `assertTransition()`** (`packages/core/src/envelope/envelope-state.ts`). No other
   code may decide whether a status change is legal.
7. **Audit:** every state change writes an audit event with `appendAuditEvent(tx, …)` **inside the
   same `prisma.$transaction`**. Never update or delete `AuditEvent` rows (the database refuses:
   the `sahihi_app` role and an update trigger, ADR 0010). New event types go in `AUDIT_EVENT_TYPES`.
8. **Secrets:** raw signing tokens and OTP codes are never stored or logged. Store only hashes
   (`hashSigningToken`, `hashOtp`). A raw token exists only in a notification job payload and the email.
   Log with `createLogger` (`@sahihi/infra`), not `console`: it redacts fields and masks tokens.
   One exception: with no SMS provider configured and `NODE_ENV=development`, `sendSms` prints the
   message (it holds the OTP) to the worker console, as Mailpit shows emails. Never elsewhere.
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
13. Validate every request body with a zod schema from `@sahihi/core` (`src/shared/schemas.ts`) via `parseJson()`.
    Shared schemas live in core so web forms and the API agree.
14. Env vars: add them to `packages/config/src/index.ts` **and** `.env.example`. Never read
    `process.env` elsewhere, with three exceptions: `apps/web` for `API_URL` (`lib/api-url.ts`),
    `STORAGE_ORIGIN`, `NODE_ENV`, `NEXT_RUNTIME` and the Sentry DSNs (`SENTRY_*`,
    `NEXT_PUBLIC_SENTRY_*`, docs/observability.md); `packages/db/prisma.config.ts` for
    `MIGRATE_DATABASE_URL` / `DATABASE_URL`; and `packages/db/src/index.ts` for `DATABASE_URL` and
    `NODE_ENV`, so the shared client works in scripts and test preloads without the full server env.
15. Prisma enums must mirror the unions in `packages/core/src/shared/enums.ts`. `packages/db/src/enums.test.ts`
    enforces this, so update both.
16. When you change better-auth plugins, run `bun run auth:schema` and reconcile section 1 of
    `schema.prisma` by hand.
17. Pure logic goes in `packages/core`, in the folder for its domain, with a `*.test.ts` next to it
    and an export in `src/index.ts`. Keep route handlers thin.
18. Don't add dependencies casually. Pin exact versions (the repo uses exact pins).

## Doc map — read before you touch

| If you're working on… | Read |
|---|---|
| Anything (first time) | `docs/architecture.md`, `docs/roadmap.md` |
| Sign-up, sessions, orgs, invitations | `docs/auth.md` |
| Field editor, signing page, stamping maths | `docs/coordinates.md` |
| Upload, stamping, finalize job | `docs/pdf-pipeline.md` |
| Send / sign / decline / void / reminders / OTP | `docs/signing-flow.md` |
| In-app notifications (bell, preferences) | `docs/notifications.md` |
| Templates (save as / use) | `docs/templates.md` |
| Webhooks (events, signing, delivery) | `docs/webhooks.md` |
| Public API `/api/v1`, API keys and scopes | `docs/public-api.md` |
| Bulk send (CSV / API, worker job) | `docs/bulk-send.md` |
| Embedded signing (iframe, allowed origins) | `docs/embedded-signing.md` |
| Plans, envelope quotas, seats | `docs/billing.md` |
| Retention, export, deleting data or a workspace | `docs/data-retention.md` |
| Logs, error tracking, queue dashboard | `docs/observability.md` |
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
- **Arc ≠ coss ≠ shadcn:** Arc components take props (`<Input label error />`, `<Select options />`,
  `<Alert tone title />`, Radix `asChild`); coss/shadcn are Base UI compound parts (`render`, `MenuPopup`
  vs `DropdownMenuContent`). Toasts: `toastManager` from `@/components/app/toast` (Arc toast stack).
  Open the installed source before guessing.
- **Theme:** `lib/theme.ts` + the account menu. Dark sets both `.dark` and `data-theme="dark"`. Field
  overlays on a PDF page sit inside `.on-paper` (always light). Re-apply the `sahihi patch (ADR 0023)`
  line in `app/globals.css` after `ui:bootstrap`.
- **Extend blocks are demos:** `ESignatureBlock` only takes `file` and builds the PDF in the browser.
  Build the field editor on `PDFEditor` in view-only mode (`renderPageOverlay`) + `lib/field-geometry.ts`,
  and the signing page on the lighter `PDFViewer`. Never use `PDFEditor`'s sign or forms modes for
  envelope fields. See ADR 0006 and `docs/ui.md` → PDFEditor configurations.
- `bun test` is the test runner (not vitest/jest). Web tests must stay DOM-free (pure helpers only).
- Registry installs need internet access to `coss.com`, `www.extend.ai` and `ui.shadcn.com`.
