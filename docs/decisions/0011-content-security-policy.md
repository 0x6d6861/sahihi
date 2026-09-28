# 0011: Nonce-based Content Security Policy

- **Status:** accepted
- **Date:** 2026-09-28

## Context
The signing page is public, handles a bearer token and captures legally binding signatures. The app
had no CSP and could be framed. The Extend PDF viewer (EmbedPDF/pdfium) compiles WebAssembly, runs
in `blob:` workers, and fetches its wasm and fallback fonts from jsdelivr. Base UI and Extend set
inline `style` attributes. Uploads and viewers talk directly to S3 with presigned URLs.

## Decision
- Per-request nonce CSP from `proxy.ts` (`lib/csp.ts#buildCsp`), with `'strict-dynamic'`. Next.js
  puts the nonce on its scripts, and the root layout opts every page into dynamic rendering
  (`connection()`) so they get it.
- `style-src 'unsafe-inline'`: nonces can't cover style attributes, and the vendored components need
  them. Scripts stay nonce-only.
- `'wasm-unsafe-eval'` (not `'unsafe-eval'`) for pdfium; `worker-src blob:`; `connect-src` for
  jsdelivr and `STORAGE_ORIGIN`.
- `frame-ancestors 'none'`.

## Consequences
- Every page is rendered per request. That's cheap for this app, since the pages already fetch per
  request.
- `STORAGE_ORIGIN` is a required web env var in production. `next.config.ts` fails the build without
  it.
- New third-party origins (analytics, error tracking, a CDN) must be added to `buildCsp` on purpose,
  with a test.
- The signing page still trusts jsdelivr for pdfium and fonts. Self-hosting them (serving
  `@embedpdf/pdfium`'s wasm from `/_next/static` or `public/`) would drop that origin, but it means
  changing the vendored `lib/pdf-thumbnail-utils.ts`, so it's left for its own ADR.
