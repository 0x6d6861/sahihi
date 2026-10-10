# Testing

Runner: **`bun test`** (Jest-compatible `bun:test` API). No vitest or jest.

## Layers

| Layer | Where | Needs infra? | Run |
|---|---|---|---|
| Unit: pure logic | `packages/core/src/**/*.test.ts` | no | `bun test` |
| Unit: PDF | `packages/pdf/src/render/pdf.test.ts` (generates PDFs in-memory with pdf-lib) | no | `bun test` |
| Fixtures & stamp placement | `packages/pdf/src/fixtures/fixtures.test.ts` (committed `fixtures/*.pdf` match the builders; stamped images land inside their field, centred and upright, on every fixture page) | no | `bun test` |
| Contract | `packages/db/src/enums.test.ts` (Prisma enums ⇄ core unions) | no | `bun test` |
| API smoke | `apps/api/src/app.test.ts` (health, 401 without a session) | no | `bun test` |
| Web helpers | `apps/web/lib/*.test.ts` (DOM-free only) | no | `bun test apps/web` |
| API/worker integration | `apps/api/test/*.itest.ts`, `apps/worker/test/*.itest.ts` | Postgres + Redis + MinIO | `bun run infra:up && bun run test:integration` |
| E2E | `apps/e2e/tests/*.e2e.ts` (Playwright, Chromium) | Postgres + Redis + MinIO + Mailpit | `bun run infra:up && bun run test:e2e` |

The root `bun run test` script covers `packages`, `apps/api/src`, `apps/worker` and `apps/web/lib`.
Integration tests are named `*.itest.ts`, so neither it nor a bare `bun test` picks them up.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on every PR:
- **`check`** (fast, no services): `bun install --frozen-lockfile` → `db:generate` → `bun run test`
  (the scoped script, not bare `bun test`) → `typecheck` → `lint`. Unit tests must stay
  infra-free.
- **`integration`** and **`e2e`** (both after `check`, in parallel), so a failure says which suite
  broke and each reruns on its own:
  - `integration`: Postgres 17 and Redis 7 as service containers, and MinIO, then
    `bun run test:integration`.
  - `e2e`: the same plus Mailpit (pinned to v1.31.2), then `bun run test:e2e`. Chromium is cached
    per Playwright version. The Playwright report (and traces, on failure) are uploaded as an
    artifact for 7 days.
  - MinIO is started with `docker run` in both, because service containers can't take its
    `server /data` command, and the bucket is created with aws-cli, like `minio-init`.
- **Test reports:** every suite writes JUnit (`bun test --reporter=junit`, Playwright's `junit`
  reporter) to `reports/`, and `scripts/test-summary.ts` turns it into the job summary on the run
  page: passed / failed / skipped, each failure with its message, and a per-file table. Failures
  with a file and line also become `::error` annotations on the PR diff. The XML is kept as an
  artifact (`junit-*`, 14 days). It runs even when the tests fail; locally,
  `bun scripts/test-summary.ts "<title>" <report.xml>` prints the markdown.

`.github/workflows/claude-review.yml` (`anthropics/claude-code-action@v1`) has two jobs:
- **`review`:** Claude reviews every non-draft PR from this repository when it opens, gets new
  commits or becomes ready. It checks the diff against the golden rules in AGENTS.md and the
  Karpathy guidelines (`.claude/skills/karpathy-guidelines/SKILL.md`: think before coding,
  simplicity first, surgical changes, goal-driven execution), posts findings inline as
  `blocking:` or `nit:`, and finishes with a summary comment. Edit the skill to change what it
  checks.
- **`fix`:** runs after `review` when the review left `blocking:` findings on the PR's head
  commit. A second Claude run checks each finding against the code and makes the smallest fix,
  with a test where one is missing. It runs `bun test`, typecheck and lint, then commits with a
  `Claude-Autofix: yes` trailer and pushes to the PR branch. Last, it replies on each thread with
  what changed, or why it left a finding to a person. The push uses the Claude GitHub App's token,
  so CI and a new review run on it. It stops after 2 rounds per PR (counted from the trailers) and
  never touches `nit:` comments, forks or drafts. Add the `no-autofix` label to a PR to turn it
  off.
- **`mention`:** answers `@claude …` in PR and issue comments from owners, members and
  collaborators.

It needs the `CLAUDE_CODE_OAUTH_TOKEN` repository secret (`claude setup-token`) and the Claude
GitHub App installed on the repository. Before each run, a one-line Claude call checks the OAuth
token. When it's missing, expired or over its plan limits, the run uses the `ANTHROPIC_API_KEY`
secret instead. A run that fails for another reason isn't repeated. With neither secret set,
the jobs skip with a warning; with a token that doesn't work and no API key, they fail. The action refuses to run a workflow file that differs
from the default branch's copy, so a PR that changes the workflow isn't reviewed by it.

## What must be tested

- **Coordinates:** every rotation (0/90/180/270), non-zero crop box origin, and round trips.
- **State machines & routing:** every allowed and disallowed transition; parallel vs sequential,
  with ties in `order`; VIEWERs never block.
- **Audit chain:** tamper, delete, reorder and gap cases are detected.
- **Crypto:** token format and entropy, OTP range and distribution, hash domain separation.
- **Schemas:** rects outside the page, bad phone numbers, non-PNG data URLs.
- **Stamping:** fields land inside their rects on rotated pages (assert on the content stream or on
  the image placement matrix).
- **Security (integration):** cross-tenant access returns 404 on every route; expired, rotated and
  voided links are rejected; double submit returns 409; OTP lockout.

## Integration tests (`apps/api/test/`)

Files are named `*.itest.ts`, so a bare `bun test` never discovers them. Run them with
`bun run test:integration`. It preloads `test/preload.ts`, which:
- points the API at `sahihi_test` (override with `TEST_DATABASE_URL`) and refuses any database whose
  name doesn't end in `_test`
- creates that database if it's missing and runs `prisma migrate deploy`. Never `migrate reset`
- uses Redis DB 15 (`TEST_REDIS_URL`), so a running dev worker never picks up test jobs
- uses the local MinIO bucket. Test objects live under their own random `org/<id>/` prefixes

Conventions (`test/helpers.ts`):
- `helpers.ts` throws on import unless `DATABASE_URL` ends in `_test`. `resetDb()` in `beforeEach`
  re-checks `current_database()`, then truncates every table except `_prisma_migrations`.
- `createSender(label)` creates a user through better-auth's API, sets `emailVerified`, signs in, and
  creates and activates an organization on the **Enterprise** plan (no quotas; pass
  `{ plan: "free" }` to test limits, `docs/billing.md`). It returns `{ userId, organizationId, cookie }`. Pass
  `{ withOrganization: false }` for the 403 `no_active_organization` case.
- `request(sender, path, { method, json })` wraps `createApp().request(...)`. No HTTP server needed.
- `uploadDocument(sender, bytes?)` runs the real create → presigned PUT → complete flow.
  `minimalPdf(pages)` builds a valid PDF without a PDF library.
- Every tenant-owned route gets a cross-tenant case in `tenant-isolation.itest.ts`: another org's
  session gets **404** (never 403, so existence isn't leaked), and the owner's rows are unchanged
  afterwards. That test lists every route the app serves, so it fails until a new route is
  classified there.
- Database privileges: `audit-append-only.itest.ts` switches to the app role with
  `SET LOCAL ROLE sahihi_app` inside `prisma.$transaction`. Tests themselves connect as the owner,
  because `resetDb()` needs TRUNCATE.
- Assert on queued jobs with `getQueues().notifications.raw.getJobs()` (Redis DB 15).
- Use the fixture PDFs in `fixtures/` (see `coordinates.md`).

## E2E (`apps/e2e`)

`bun run test:e2e` runs the core journey through the real UI and real email:
sign-up → verify email (Mailpit) → create workspace → upload a PDF → create envelope → add a
recipient → place a signature field → send → the signer opens the emailed link in a separate
browser context, types a signature, consents and finishes → the worker stamps the PDF and issues
the certificate → the public `/verify/<code>` page. It takes about 25 s.

A second journey, `multi-document.e2e.ts` (ADR 0037), adds a second document from the draft
editor's "Add document" dialog and a supporting CSV, places a signature on each document (switching
documents in the field editor), has the signer sign both (switching with "Next field" and reusing
the adopted signature), then checks "Download all" and that `/verify` lists both documents and the
file. About 30 s.

**Its own stack.** It never uses your `.env` or dev database. `playwright.config.ts` and
`global-setup.ts` start:
- the api on **4100** and `next dev` on **3100**, via Playwright's `webServer`;
- the worker, as a child process;
- all with explicit env from `apps/e2e/env.ts`: database `sahihi_e2e` (created and migrated by
  `scripts/prepare-db.ts`, which refuses any database not named `*_e2e`), Redis DB **14**, and the
  shared MinIO bucket and Mailpit.

Each run uses unique `@example.test` addresses, so Mailpit lookups (`tests/mailpit.ts`) never pick
up another run's email.

**Before running:**
- `bun run infra:up`.
- Stop `bun run dev`: Next allows one `next dev` per app directory.
- First time only: `cd apps/e2e && bunx playwright install chromium`.

**Conventions:**
- Files are `*.e2e.ts` (`testMatch`), so a bare `bun test` never picks them up.
- Wait for `networkidle` after navigating to a page that's compiling for the first time. Typing
  before React hydrates is lost (`settle()`).
- Use roles and labels, not CSS. `[data-field-layer]` (the field editor's page overlay) is the one
  structural hook.
- On failure, the screenshot, video and trace are in `apps/e2e/test-results/`
  (`bunx playwright show-trace …`). Both output folders are gitignored.

In CI it runs in the `e2e` job (below). With `CI` set, Playwright retries once and
allows longer timeouts for cold `next dev` compiles.
