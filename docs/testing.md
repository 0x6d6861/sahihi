# Testing

Runner: **`bun test`** (Jest-compatible `bun:test` API). No vitest or jest.

## Layers

| Layer | Where | Needs infra? | Run |
|---|---|---|---|
| Unit: pure logic | `packages/core/src/*.test.ts` | no | `bun test` |
| Unit: PDF | `packages/pdf/src/pdf.test.ts` (generates PDFs in-memory with pdf-lib) | no | `bun test` |
| Fixtures & stamp placement | `packages/pdf/src/fixtures.test.ts` (committed `fixtures/*.pdf` match the builders; stamped images land inside their field, centred and upright, on every fixture page) | no | `bun test` |
| Contract | `packages/db/src/enums.test.ts` (Prisma enums ⇄ core unions) | no | `bun test` |
| API smoke | `apps/api/src/app.test.ts` (health, 401 without a session) | no | `bun test` |
| Web helpers | `apps/web/lib/*.test.ts` (DOM-free only) | no | `bun test apps/web` |
| API/worker integration | `apps/api/test/*.itest.ts`, `apps/worker/test/*.itest.ts` | Postgres + Redis + MinIO | `bun run infra:up && bun run test:integration` |
| E2E | Playwright (**to create**, roadmap P5) | full stack | `bunx playwright test` |

The root `bun run test` script covers `packages`, `apps/api/src`, `apps/worker` and `apps/web/lib`.
Integration tests are named `*.itest.ts`, so neither it nor a bare `bun test` picks them up.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on every PR: `bun install --frozen-lockfile` →
`db:generate` → `bun run test` (the scoped script, not bare `bun test`) → `typecheck` → `lint`. It
needs no services and no `.env`, so unit tests must stay infra-free. When the API integration tests
land, add a separate job with Postgres, Redis and MinIO service containers, and keep this one fast.

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
  creates and activates an organization. It returns `{ userId, organizationId, cookie }`. Pass
  `{ withOrganization: false }` for the 403 `no_active_organization` case.
- `request(sender, path, { method, json })` wraps `createApp().request(...)`. No HTTP server needed.
- `uploadDocument(sender, bytes?)` runs the real create → presigned PUT → complete flow.
  `minimalPdf(pages)` builds a valid PDF without a PDF library.
- Every tenant-owned route gets a cross-tenant test: another org's session gets **404** (never 403,
  so existence isn't leaked), and the owner's row is unchanged afterwards.
- Assert on queued jobs with `getQueues().notifications.raw.getJobs()` (Redis DB 15).
- Use the fixture PDFs in `fixtures/` (see `coordinates.md`).
