# Roadmap

Agents: take the **first unchecked item** unless told otherwise, and tick it in the same change.
Code has `TODO(roadmap Pn)` markers where the work plugs in. Keep items small (one PR each).

Legend: `[x]` done · `[ ]` to do · `[~]` partially done (see note)

## P0: Foundation

- [x] Bun monorepo: apps (api, worker, web), packages (config, core, db, infra, pdf), Biome, TS strict
- [x] docker-compose: Postgres 17, Redis 7, MinIO + bucket init, Mailpit
- [x] Env schema (`@sahihi/config`) + `.env.example`
- [x] Prisma 7 schema: better-auth tables + domain (Document, Envelope, Recipient, Field, RecipientOtp, AuditEvent, Certificate)
- [x] better-auth: email+password, verification, reset, Organization plugin; Hono handler; web client
- [x] Same-origin `/api` rewrite, Next 16 `proxy.ts` guard
- [x] Core domain: enums, envelope/recipient state machines, routing, coordinates, crypto, audit chain, zod schemas + tests
- [x] Typed BullMQ queues; worker skeleton with notifications, finalize, maintenance schedulers
- [x] Agent docs: AGENTS.md, CLAUDE.md, docs/*, ADRs, `.claude/commands`
- [x] **Run `bun run ui:bootstrap`** (needs internet): install coss (`@coss/style`) + Extend components; confirm `bun run typecheck` passes for `@sahihi/web`
- [x] Wrap the app in coss `ToastProvider` + `AnchoredToastProvider` (`app/layout.tsx`)
- [x] First migration: `bun run db:migrate --name init` and commit `packages/db/prisma/migrations`
- [x] App shell with coss `Sidebar` + org switcher (`Menu`, `organization.setActive`) (`app/(app)/layout.tsx`)
- [x] CI (GitHub Actions): bun install → db:generate → test → typecheck → lint

## P1: Documents

- [x] API: presigned upload → complete (inspect, hash) → list/get/file/delete
- [x] Web documents page + upload: Extend `FileUpload` + coss `Progress`, `Empty`, `Skeleton` (`loading.tsx`), toasts
- [x] Document detail page: Extend `PDFViewer` (read-only, `showUpload={false}`) + "Create envelope" action
- [x] Extend `FileThumbnail` in the list; `Pagination` (`GET /documents?page=N` → `{ items, page, pageSize, total }`)
- [x] Integration test harness (`apps/api/test/`, see `docs/testing.md`) + documents tests incl. cross-tenant 404
- [x] Worker job to clean up `UPLOADING` documents older than 1 hour (`documents.sweep-uploads`, every 15 min)

## P2: Envelope drafting & field placement

- [x] API: create envelope, replace recipients, replace fields (draft-only, VIEWER rule), audit
- [x] `lib/field-geometry.ts` (pointer → normalized, drag/click/move/resize, clamp) + tests
- [x] New-envelope flow: pick document → title/message/expiry/order (coss `Form`, `DatePicker`, `Switch`)
- [x] Recipients editor: list with role, order (`NumberField`), verification (`Select`), phone for SMS
- [x] **Field editor** (`components/app/field-editor/`): `PDFEditor` view-only shell + `renderPageOverlay` field layer (ADR 0006), toolbar (`ToggleGroup` field types, `Select` recipient), drag to draw / click to place, move/resize handles, keyboard nudge/delete, properties `Popover`, debounced autosave with status (see `docs/signing-flow.md` → Field placement)
- [x] **Prepare document**: full `PDFEditor` (redact, pages, forms) → `getDocumentBuffer()` → upload as a new Document; add `Document.sourceDocumentId` (migration) + show lineage in the documents list
- [x] Fixture PDFs (`fixtures/`): rotated 90/270, cropbox offset, mixed sizes, scanned
- [x] Envelope detail page: Tabs (Document / Recipients / Activity), status badge, send button with preflight errors shown inline

## P3: Sending & signing

- [x] API: send (preflight, links, audit), OTP send/verify, file (marks viewed), submit, decline, remind, void
- [x] Notifications worker: invite, reminder, OTP (email/SMS), completed, declined, voided, auth emails
- [x] `/sign/[token]` page: states, OTP step and signing surface
- [x] Swap the OTP input for coss `OTPField length={6}` with resend cooldown (server-enforced 30 s)
- [x] **Signing surface** (ADR 0008): `PDFViewer` with this recipient's fields, Extend E-Signature dialog (draw/type/upload → PNG), text/checkbox inputs, "Next field" navigation + `Progress`, consent `Checkbox`, submit/decline (`AlertDialog`)
- [x] Record `CONSENT_VERSION` in `recipient.consented` data (+ text hash; stale version → 409; shown on the certificate)
- [x] Sender actions in envelope detail: remind (`Menu`, throttled 1 h), void (`AlertDialog` + reason), copy status
- [x] Email templates polish (HTML + text) with org branding: React Email, org logo/name, Reply-To sender

## P4: Finalization & certificates

- [x] Finalize job: verify original hash → stamp → provider seal → store signed.pdf → certificate.pdf → notify
- [x] `renderCertificate` with hashes, signers, events, chain head, QR code
- [x] Verify API (by code, by hash) + `/verify/[code]` page
- [ ] "Drop a PDF to verify" on `/verify`: Extend `FileUpload`, hash in the browser (Web Crypto), `POST /api/verify/hash`
- [ ] Downloads on envelope detail + signer "completed" state
- [ ] Unicode font embedding (Noto Sans via `@pdf-lib/fontkit`) for non-Latin text fields

## P5: Hardening & SaaS

- [ ] Role-based permissions via organization access control (`docs/auth.md` → Roles)
- [ ] Members & invitations settings page
- [ ] Cross-tenant integration test over every route; DB role without UPDATE/DELETE on AuditEvent
- [ ] CSP headers; security review of `/sign` and `/verify`
- [ ] Templates (reusable recipients + field layouts)
- [ ] Webhooks per org (envelope.completed, …) with signed payloads
- [ ] Billing per org (plans, envelope quotas)
- [ ] Retention settings + data export/delete (Kenya DPA)
- [ ] Playwright E2E: sign-up → upload → place → send → sign (Mailpit) → certificate
- [ ] Observability: structured logs, BullMQ dashboard, error tracking

## Later

- [ ] **CA integration** via `SigningProvider` (PAdES-B-LT), see `docs/certificates.md`
- [ ] DOCX → PDF conversion on upload (LibreOffice in the worker)
- [ ] Bulk send, public API + API keys, embedded signing
- [ ] SMS/WhatsApp delivery of signing links (Africa's Talking)
