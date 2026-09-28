# Sahihi

Send PDFs for electronic signature. Upload a document, place signature fields, send unique
signing links, and collect a signed PDF plus a verifiable **Certificate of Completion**.

> *Sahihi* is Swahili for "signature" (and "correct"). It's a working name; rename freely.

## Quick start

Prerequisites: [Bun](https://bun.sh) ≥ 1.3, Docker, and internet access for the one-time UI install.

```bash
bun install
cp .env.example .env            # then set BETTER_AUTH_SECRET: openssl rand -base64 32
bun run infra:up                # Postgres, Redis, MinIO (+ bucket), Mailpit
bun run db:generate
bun run db:migrate              # applies committed migrations (prisma migrate dev)
bun run ui:bootstrap            # installs coss ui + Extend UI components into apps/web
bun run dev                     # web http://localhost:3000 · api http://localhost:4000
```

- Emails (verification, signing links, OTPs) land in Mailpit: http://localhost:8025
- MinIO console: http://localhost:9001 (`sahihi` / `sahihi-secret`)

## Checks

```bash
bun test          # unit tests (no infrastructure needed)
bun run typecheck
bun run lint
```

## Layout

```
apps/api      Hono API (auth, documents, envelopes, public signing, verify)
apps/worker   BullMQ jobs (email/SMS, PDF finalization + certificate, reminders, expiry)
apps/web      Next.js 16 app (coss ui + Extend UI, defaults only)
packages/*    config · core (pure domain) · db (Prisma) · infra (S3, queues) · pdf (pdf-lib)
docs/         Architecture, flows, security, UI rules, roadmap, ADRs
```

Start with [`AGENTS.md`](./AGENTS.md), then [`docs/architecture.md`](./docs/architecture.md) and
[`docs/roadmap.md`](./docs/roadmap.md).

## Deploying (Railway)

Run three services from this repo, each with a start command, plus Postgres and Redis plugins:

| Service | Build | Start |
|---|---|---|
| api | `bun install && bun run db:generate` | `bun run --filter @sahihi/db migrate:deploy && bun apps/api/src/index.ts` |
| worker | `bun install && bun run db:generate` | `bun apps/worker/src/index.ts` |
| web | `bun install && bun run --filter @sahihi/web build` | `bun run --filter @sahihi/web start` |

Use any S3-compatible bucket (AWS S3, Cloudflare R2, Railway volume + MinIO) and set
`EMAIL_TRANSPORT=postmark`. See `docs/architecture.md` → Deployment.
