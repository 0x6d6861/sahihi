# 0001: Bun monorepo with a separate Hono API, BullMQ worker and Next.js web

- **Status:** accepted
- **Date:** 2026-09-26

## Context
We need a SaaS with background work (email, SMS, PDF processing, scheduled reminders) and a public
signing surface. The team already runs Bun + Hono + Prisma + BullMQ + Next.js on Railway.

## Decision
One Bun workspace: `apps/api` (Hono), `apps/worker` (BullMQ), `apps/web` (Next.js App Router), and
shared `packages/*`. Domain logic lives in a pure `@sahihi/core` package usable by all three.
The web app talks to the API over HTTP only, proxied same-origin through a Next rewrite.

## Consequences
- The API and worker scale independently, and PDF work never blocks requests.
- Two deployables to keep in sync, which typed queue contracts in `@sahihi/infra` mitigate.
- The web app can't import DB code, which keeps the boundary clean.
