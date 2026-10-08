# In-app notifications

The bell in the top bar tells senders what happened to their envelopes and tells owners and admins
what happened to the workspace (ADR 0029). It's separate from email: recipients' invites and
reminders, and the completed / declined / voided emails (`apps/worker/src/jobs/notifications.ts`),
work as before and these settings don't affect them.

## Types and who gets them

The catalog is `NOTIFICATION_CATALOG` in `packages/core/src/notifications/notifications.ts`.
**Owner** means the person who created the envelope, bulk send or export. **Admins** means every
member whose role can manage members (owners and admins, `receivesAdminNotifications`).

| Type | Audience | Written by | Default |
|---|---|---|---|
| `recipient.viewed` | owner | `GET /api/sign/:token/file`, first view | off |
| `recipient.signed` | owner | `POST /api/sign/:token/submit`, unless it was the last signature | on |
| `envelope.completed` | owner | finalize job, once the signed PDF and certificate exist | on |
| `envelope.declined` | owner | `POST /api/sign/:token/decline` (with the reason, cut to 200 chars) | on |
| `envelope.expired` | owner | `envelopes.expire` job | on |
| `envelope.voided` | owner | `voidEnvelope`, only when **someone else** voided it | on |
| `bulk_send.finished` | owner | `processBulkSend`, when the batch is DONE | on |
| `export.ready` / `export.failed` | owner (the requester) | `buildExport` | on |
| `member.joined` | admins, except the new member | better-auth `afterAcceptInvitation` | on |
| `billing.quota_warning` | admins | `sendEnvelope`, the send that reaches 80% of the monthly quota | on |
| `billing.quota_reached` | admins | `sendEnvelope`, the send that uses the last envelope | on |

The last signature isn't reported as `recipient.signed`: `envelope.completed` follows once the
signed PDF is ready, so the sender gets one notification instead of two.

## How they're written

- `Notification` rows: one per user per event, with `organizationId`, `type`, optional `envelopeId`,
  `data` (a snapshot of names and counts, `NotificationData`) and `readAt`.
- Written with `notifyEnvelopeOwner`, `notifyWorkspaceAdmins` or `notifyUsers` (`@sahihi/db`)
  **inside the same transaction** as the change, like audit events and the webhook outbox. If the
  change rolls back, so does the notification. Nothing is enqueued.
- The helpers skip people who are no longer members of the workspace and people who turned the
  type off.
- Quota notifications need no extra state. Sends are serialised per workspace by the quota lock
  and the count only goes up, so exactly one send per period lands on 80% and one on the limit
  (`quotaNotificationFor`). Tiny plans where 80% rounds up to the limit only get "limit reached".
- Text and links are built at display time by `describeNotification` (core), shared by the API and
  the web app. Unknown types (a newer API) show a generic line.

## API (`/api/notifications`, session + active workspace)

Every query is scoped to the signed-in user **and** the active workspace.

| Route | |
|---|---|
| `GET /` | Newest first. `?limit` (1–50, default 20), `?cursor` (the last id of the previous page), `?unread=1`. Returns `{ items, nextCursor, unreadCount }` |
| `GET /unread-count` | `{ count }`, for the badge |
| `POST /read` | `{ ids: [...] }` or `{ all: true }`. Ids that aren't yours are ignored. Returns `{ updated }` |
| `POST /unread` | `{ ids: [...] }`, back to unread. Returns `{ updated }` |
| `POST /dismiss` | `{ ids: [...] }`, deletes them. Returns `{ deleted }` |
| `GET /preferences` | `{ items: [{ type, enabled }] }`, only the types this member can receive |
| `PUT /preferences` | `{ settings: { [type]: boolean } }`, merged into what's stored. Returns the same as GET |

## Preferences

`NotificationPreference` holds one row per user and workspace with only the types they changed
(`settings` JSON); everything else uses the catalog default. **Settings → Notifications** shows a
switch per type, saved as soon as it changes. Members don't see workspace types they can't receive.

## The bell (web)

Arc's `notification-center` block (`components/arc/notification-center/`, vendored, one local
patch: ADR 0030),
wrapped by `components/app/notifications/notification-bell.tsx` in the app shell next to the
account menu. It's keyed by workspace, so switching workspaces starts it over.

- It loads the newest 50 (`BELL_PAGE_SIZE`; the block has no paging) and reloads every 60 s
  (`NOTIFICATIONS_POLL_MS`) while the tab is visible, and on focus. There's no websocket or SSE
  (ADR 0029).
- The block keeps its own copy of the list after mount. The bell remounts it with the new list when
  the ids or read states changed (`notificationsSignature`), and waits while it's open.
- Rows show the title, a one-line body, a time ("5m", "3h") and a tone icon (`toCenterItems`, text
  and tone from `describeNotification`). Choosing a row expands it with **Mark read / Mark unread**
  and **Dismiss**. The header has All / Unread and **Mark all read**, and the footer **Clear read**.
- The block reports every change one item at a time. `createActionBatcher` sends one request per
  action on the next tick (`/read`, `/unread`, `/dismiss`), and a failure shows a toast and
  reloads the server's state on the next poll.
- An expanded row also has an **Open …** action ("Open envelope", "Open Data settings";
  `openLabelFor`) through a local patch to the block (ADR 0030). It closes the panel, marks the item
  read and goes to its page (`describeNotification(...).href`).

## Retention

- Deleted after **90 days**, read or not (`NOTIFICATION_TTL_DAYS`, `notifications.cleanup` job,
  daily 02:50 Nairobi).
- Purging an envelope deletes its notifications, because they quote the title and recipients' names
  (docs/data-retention.md).
- Rows cascade when the user, the workspace or the envelope is deleted.

## Tests

`packages/core/src/notifications/notifications.test.ts` (catalog, preferences, quota thresholds,
display), `apps/web/lib/notifications.test.ts`, `apps/api/test/notifications.itest.ts` (each event
from the real routes, preferences, paging, isolation between users and workspaces) and
`apps/worker/test/notifications.itest.ts` (expiry, purge, cleanup). The routes are classified in
`tenant-isolation.itest.ts`.

## Not in v1

Push or email digests of these notifications, per-envelope muting, and notifying admins about
envelopes they didn't create.
