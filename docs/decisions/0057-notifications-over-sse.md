# 0057: Inbox badge pushed over SSE, signalled by Postgres NOTIFY

- **Status:** accepted; supersedes decision 5 of ADR 0029
- **Date:** 2026-10-14

## Context
The Inbox badge polled `GET /api/notifications/unread-count` every 60 seconds and on focus (ADR
0029). A signature could take up to a minute to show, and every open tab made a request a minute
even when nothing happened. ADR 0029 expected this: an SSE endpoint can push "something changed"
and keep the same rows and API.

Notifications are written inside the change's transaction, from the API, `@sahihi/envelopes` and
the worker (about a dozen call sites). Whatever signals a change must not fire for a write that
rolls back, and should need nothing new at those call sites.

## Decision
- **Signal with Postgres `NOTIFY`, not Redis pub/sub.** `notifyUsers` and `notifyEnvelopeOwner`
  run `pg_notify('sahihi_notifications', '<organizationId>:<userId>')` for the users they wrote
  (`signalNotifications`, `@sahihi/db`). A NOTIFY sent in a transaction is delivered on commit and
  dropped on rollback, so the existing "a notification exists if and only if the change
  committed" rule covers the signal too, from the API and the worker alike. Redis would need a
  publish-after-commit hook at every caller. `POST /read`, `/unread` and `/dismiss` signal too, so
  the user's other tabs follow.
- **The payload is ids, never data.** Listeners re-read through the authenticated API.
- **One listener per API process** (`apps/api/src/lib/notification-hub.ts`): a dedicated pg
  connection (`createListenClient`), opened with the first stream, reconnecting with backoff.
  Once listening it tells every open stream to re-read, so a signal missed while it was down is
  caught up. The fan-out is pure and unit-tested (`notification-fanout.ts`).
- **`GET /api/notifications/stream`** (behind `requireOrg`) sends a `count` event on open and after
  each signal for that user and workspace (debounced 250 ms), a heartbeat comment every 20 s, and
  ends after 10 minutes. The browser's EventSource reconnects through `requireOrg` again, so a
  revoked session, a removed member or a workspace switch stops hearing within minutes. At most
  10 streams per user and workspace (one per tab); more get a 429.
- **The web app keeps polling only as a fallback**: every 60 s and on focus while the stream isn't
  open, reopening it if the browser gave up (an error response, such as an API restart behind the
  Next rewrite).
- `Cache-Control: no-cache, no-transform` keeps compressing proxies, Next's among them, from
  buffering the stream; `X-Accel-Buffering: no` does the same for nginx. Bun's 10 s idle timeout
  is lifted for the stream's request.

## Consequences
- The badge, and an open Inbox list, update about a quarter of a second after the change commits.
- The listener needs a direct Postgres connection: a transaction-mode pooler (PgBouncer) doesn't
  deliver NOTIFY. Railway's Postgres is direct; revisit if a pooler is added.
- Each API process holds one extra Postgres connection, and each open tab one long request.
- Browsers allow 6 connections per origin over HTTP/1.1, so many tabs on plain-HTTP localhost can
  run out. Production is HTTP/2. A tab-leader (BroadcastChannel) would fix it if it ever matters.
- Notification deletions by retention, purging and member removal don't signal. The badge catches
  up on the next stream open or the next change.
