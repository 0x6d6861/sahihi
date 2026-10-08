# 0029: In-app notifications written in the transaction, polled by the web app

- **Status:** accepted
- **Date:** 2026-10-07

## Context

Senders only learned what happened to an envelope by opening it or from the few emails the worker
sends them (completed, declined). Owners and admins had no signal when someone joined, an export
finished or the workspace was about to run out of envelopes. We want a bell in the top bar with
per-type preferences.

Constraints:

- Every state change already writes an audit event and a webhook outbox row in its transaction
  (golden rules 7 and 11). A notification must never describe a change that rolled back.
- Production runs on Railway as three services. Long-lived connections (SSE, websockets) through
  the Next.js rewrite to the API are possible but add moving parts for little gain at this stage.
- Notifications quote names (recipients, envelope titles), so retention and purging apply to them.

## Decision

1. **One `Notification` row per recipient user, written in the same transaction** as the change,
   through `notifyEnvelopeOwner` / `notifyWorkspaceAdmins` / `notifyUsers` in `@sahihi/db`. No queue:
   the write is a single `createMany`, and the transaction already holds the data needed.
2. **Store a snapshot, render at read time.** `data` keeps names and counts. Titles and links come
   from `describeNotification` in `@sahihi/core`, so wording can change without a migration and the
   web app needs no extra API.
3. **`type` is a string, not a Prisma enum.** The catalog lives in core. Adding a type is a code
   change only, and older rows with a removed type still display (generically).
4. **Preferences are per user and workspace**, stored as a sparse JSON map over catalog defaults.
   Off means not written at all, not hidden.
5. **The web app polls** the unread count every 60 seconds while the tab is visible, and loads the
   list when the bell opens.
6. **Quota notifications are derived, not tracked.** The send transaction holds the quota lock and
   knows the count before and after, so "the send that lands on 80%" and "the send that lands on the
   limit" each happen once per period.

## Consequences

- Notifications are exactly as reliable as the changes they report, and need no sweeper.
- Up to a minute of delay before the badge updates. If that matters later, an SSE endpoint can push
  "something changed" and keep the same rows and API.
- Writers must remember to call the helper; the itests cover each type through its real route or job.
- Rows are deleted after 90 days and when their envelope is purged.
