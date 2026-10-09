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
- [x] Grid view with first-page thumbnails rendered by the worker (`document.thumbnail`, hourly backfill
      sweep, cacheable presigned URLs, Drive-style cards, layout saved in a cookie) (ADR 0033, 0034)
- [x] Same list experience on Envelopes and Templates: server-side search, chips and paging, list / grid with
      document thumbnails, status icons, avatars, signing-progress rings, ⋮ menus (ADR 0036)
- [x] Multi-document envelopes and supporting files: several documents per envelope (and template), one
      signed PDF each, one certificate, "Download all" zip, files shared with signers (ADR 0037)
- [x] Folders on the Documents page (nested; create, rename, move, delete → contents move up) +
      search and Status / Sender / Period filters (ADR 0022)
- [x] Color and tags on folders and documents, searchable (`q` matches tags; Tag and Color filters
      search every folder) (ADR 0025)

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
- [x] "Drop a PDF to verify" on `/verify`: Extend `FileUpload`, hash in the browser (Web Crypto), `POST /api/verify/hash`
- [x] Downloads on envelope detail + signer "completed" state
- [x] Unicode font embedding (Noto Sans via `@pdf-lib/fontkit`) for non-Latin text fields

## P5: Hardening & SaaS

- [x] Role-based permissions via organization access control (`docs/auth.md` → Roles)
- [x] Members & invitations settings page
- [x] Cross-tenant integration test over every route; DB role without UPDATE/DELETE on AuditEvent
- [x] CSP headers; security review of `/sign` and `/verify`
- [x] Templates (reusable recipients + field layouts)
- [x] Webhooks per org (envelope.completed, …) with signed payloads
- [~] Billing per org (plans, envelope quotas): plans, envelope quotas and seats enforced; no payment provider yet (`docs/billing.md`)
- [x] Retention settings + data export/delete (Kenya DPA)
- [x] Playwright E2E: sign-up → upload → place → send → sign (Mailpit) → certificate
- [x] Observability: structured logs, BullMQ dashboard, error tracking
- [x] Arc design system: Arc primitives and tokens over coss/Extend, light + dark with a theme switch (ADR 0023, `docs/ui.md`)
- [x] Account settings: profile (picture, name, email change, saved signature), security (password, TOTP 2FA +
      backup codes, sessions), workspace (name, logo in emails and signing page, leave) (`docs/auth.md`
      → Account settings, ADR 0028)
- [x] In-app notifications: bell in the top bar (envelope and workspace events), per-type preferences
      in Settings → Notifications (`docs/notifications.md`, ADR 0029)
- [x] Inbox: notifications (paged, unread badge on the tab), workspace activity feed
      (`GET /api/activity`) and bulk sends in one place; the bell and the Documents, Envelopes and
      Templates tabs removed (their lists redirect to All files)
- [x] Inbox search and filters: text search and Status / Type / Date chips on notifications, Type /
      People / Date on workspace activity, Status on bulk sends (ADR 0041) (`docs/notifications.md`, ADR 0041)
- [x] Shared folders and labels for documents, envelopes and templates (ADR 0038)
- [x] All files: one home page for documents, envelopes and templates, with one search and
      Type / Status / People / Added / Tags / Color filters (ADR 0038, `docs/ui.md`)
- [x] Drag and drop on All files: drag items onto folders and crumbs, multi-select and Move…,
      drop PDFs from the desktop to upload, drop onto a file to make a folder, Undo
      (`POST /files/move`, `POST /files/group`, ADR 0039)
- [x] ~~Drag and drop on the Documents page~~: the Documents page was folded into All files, which has it (ADR 0041)
- [x] Passkeys, delete account (erase the person, keep the work; ADR 0040), forgot/reset password
      pages (`docs/auth.md`)

## P6: AI document generator (`docs/ai-documents.md`, ADR 0042)

- [x] Thin slice: Mutual NDA starter → assistant questions (≤ 3 per batch, skip) and blank filling
      with a provenance check → signers → PDF render (pdf-lib, deterministic, field rects) →
      finalise into a READY document and a DRAFT envelope; workspace opt-in and `ai:use`
- [x] Rich-text editing: TipTap with section, blank and signature-block nodes; italics (font) and
      tables, in the editor and the PDF; edits apply over answers given meanwhile (ADR 0043)
- [x] Assistant edit proposals (`propose_section_edit`, `propose_sections`) with a diff and
      accept/reject, each accepted change a version; invented specifics refused (ADR 0044)
- [ ] Assistant-defined signers and fields (`define_signers`, `place_signature_field`), initials on
      every page, text and checkbox fields
- [ ] More starters (offer letter, policy, board resolution, invoice cover letter)
- [ ] Save a generated document as a template (blanks and roles intact)
- [ ] Lock a finalised document's fields in the envelope editor; new version after send
- [ ] Plan quota for assistant turns; generated documents in exports and retention

## Later

- [ ] **CA integration** via `SigningProvider` (PAdES-B-LT), see `docs/certificates.md`
- [ ] DOCX → PDF conversion on upload (LibreOffice in the worker)
- [x] Bulk send, public API + API keys, embedded signing (docs/public-api.md, docs/bulk-send.md,
      docs/embedded-signing.md, ADR 0017)
- [ ] SMS/WhatsApp delivery of signing links (Africa's Talking)
- Automatic field detection, local only (ADR 0020):
  - [x] Import the PDF's own form fields (AcroForm) as suggested fields, roles from field names
  - [x] Anchor tags (`{{s1:signature}}`) on the text layer (PDFium WASM, `docs/pdf-pipeline.md`)
  - [x] Text-layer rules: labels + signature lines, signature blocks, parties-clause roles
  - [ ] Scanned PDFs: local OCR (tesseract.js) feeding the same rules
