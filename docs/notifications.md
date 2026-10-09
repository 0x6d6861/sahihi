# In-app notifications

The **Inbox** (`/inbox`, ADR 0041) tells senders what happened to their envelopes and tells owners and admins
what happened to the workspace (ADR 0029). It's separate from email: recipients' invites and
reminders, and the completed / declined / voided emails (`apps/worker/src/jobs/notifications.ts`),
work as before and these settings don't affect them.

## Types and who gets them

The catalog is `NOTIFICATION_CATALOG` in `packages/core/src/notifications/notifications.ts`.
**Owner** means the person who created the envelope, bulk send or export. **Admins** means every
member whose role can manage members (owners and admins, `receivesAdminNotifications`).

| Type | Audience | Written by | Default |
|---|---|---|---|
| `recipient.viewed` | owner | `GET /api/sign/:token/file`, first view (claimed, so simultaneous first views count once) | off |
| `recipient.signed` | owner | `POST /api/sign/:token/submit`, unless it was the last signature | on |
| `envelope.completed` | owner | finalize job, once the signed PDF and certificate exist | on |
| `envelope.declined` | owner | `POST /api/sign/:token/decline` (with the reason, cut to 200 chars) | on |
| `envelope.expired` | owner | `envelopes.expire` job | on |
| `envelope.voided` | owner | `voidEnvelope`, only when **someone else** voided it | on |
| `bulk_send.finished` | owner | `processBulkSend`, when the batch is DONE (also when its template was deleted first: every row fails) | on |
| `export.ready` / `export.failed` | owner (the requester) | `buildExport`, after the status is saved (best effort, see below) | on |
| `member.joined` | admins, except the new member | better-auth `afterAcceptInvitation` (best effort, see below) | on |
| `billing.quota_warning` | admins | `sendEnvelope`, the send that reaches 80% of the monthly quota | on |
| `billing.quota_reached` | admins | `sendEnvelope`, the send that uses the last envelope | on |

The last signature isn't reported as `recipient.signed`: `envelope.completed` follows once the
signed PDF is ready, so the sender gets one notification instead of two. Nobody is told about their
own action: not the person who voided, and not a sender who is also a recipient of their own
envelope (matched by email).

## How they're written

- `Notification` rows: one per user per event, with `organizationId`, `type`, optional `envelopeId`,
  `data` (a snapshot of names and counts, `NotificationData`) and `readAt`.
- Written with `notifyEnvelopeOwner`, `notifyWorkspaceAdmins` or `notifyUsers` (`@sahihi/db`)
  **inside the same transaction** as the change, like audit events and the webhook outbox. If the
  change rolls back, so does the notification. Nothing is enqueued.
- Two exceptions, where the change is already committed when we learn of it and a failed
  notification must not undo or fail it: `member.joined` (better-auth has added the member) and
  `export.ready` / `export.failed` (the archive is in storage, the status saved). These are written
  right after, and a failure is logged, not raised.
- The helpers skip people who are no longer members of the workspace and people who turned the
  type off. `notifyEnvelopeOwner` checks that before reading anything else, so a type that's off
  (the default for "Opened") costs one envelope read on the signing routes. Callers pass the
  recipient's name and email (they hold the row) and, for a void, the actor, whose name is read
  only when a notification is written.
- Quota notifications need no extra state. Sends are serialised per workspace by the quota lock
  and the count only goes up, so exactly one send per period lands on 80% and one on the limit
  (`quotaNotificationFor`). Tiny plans where 80% rounds up to the limit only get "limit reached".
- Text and links are built at display time by `describeNotification` (core), shared by the API and
  the web app. Unknown types (a newer API) show a generic line.

## API (`/api/notifications`, session + active workspace)

Every query is scoped to the signed-in user **and** the active workspace.

| Route | |
|---|---|
| `GET /` | Newest first. `?limit` (1–50, default 20), `?cursor` (the previous page's `nextCursor`: the last item's position, `createdAt` and id, so paging survives that item being dismissed), `?unread=1` or `?read=1`, `?type` (a notification type), `?period` (`7d`, `30d`, `90d`, `year`), `?q` (any case, over the names and titles it quotes: `NOTIFICATION_SEARCH_KEYS`). Returns `{ items, nextCursor, unreadCount }`; `unreadCount` ignores the filters |
| `GET /unread-count` | `{ count }`, for the badge |
| `POST /read` | `{ ids: [...] }` or `{ all: true }`. Ids that aren't yours are ignored. Returns `{ updated }` |
| `POST /unread` | `{ ids: [...] }`, back to unread. Returns `{ updated }` |
| `POST /dismiss` | `{ ids: [...] }`, deletes them. Returns `{ deleted }` |
| `GET /preferences` | `{ items: [{ type, enabled }] }`, only the types this member can receive |
| `PUT /preferences` | `{ settings: { [type]: boolean } }`, merged into what's stored. Returns the same as GET |

**Workspace activity** (`GET /api/activity`, session + active workspace, any member; ADR 0041): audit
events of every envelope in the workspace, newest first. `?limit` (1–50, default 30), `?cursor`
(the last event's `occurredAt` and id), `?group=all|signing|sending|system`,
`?actor` (a member's user id), `?period`, `?q` (envelope title, recipient name or the acting
member's name, any case). Returns `{ items: [{ id, type, occurredAt, envelopeId, envelopeTitle,
recipientName, actorName, data }], nextCursor, people }`. `people` (the workspace's members) comes
with the first page only. `data` is trimmed to what the line quotes (`activityData`), so no IP
addresses, user agents, hashes, emails or storage keys. Read-only, so it writes no audit event.

## Preferences

`NotificationPreference` holds one row per user and workspace with only the types they changed
(`settings` JSON); everything else uses the catalog default. **Settings → Notifications** shows a
switch per type, saved as soon as it changes. Members don't see workspace types they can't receive.

## The Inbox (web)

`/inbox` replaced the bell (ADR 0041). Its tabs are switched with `?tab=`:
**Notifications**, **Workspace activity** and **Bulk sends**. Each has the All files search section
(`ListSearch`, without the List / Grid switch): a search box (debounced) and filter chips with
"Clear filters". The choices live in the component, not the URL; query strings are built in
`lib/inbox.ts`. An empty result says "No matching …" with "Clear search and filters".

- **Unread badge:** the Inbox pill in the top bar shows how many are unread. `UnreadCountProvider`
  (`components/app/inbox/unread-count.tsx`) polls `GET /notifications/unread-count` every 60 s
  (`NOTIFICATIONS_POLL_MS`) while the tab is visible, and on focus, and starts over on a workspace
  switch. There's no websocket or SSE (ADR 0029).
- **Notifications** (`components/app/inbox/notification-list.tsx`): the first 50 come with the page,
  "Load more" follows `nextCursor` (`INBOX_PAGE_SIZE`). Search (envelope, recipient or member
  name) and the Status (Unread / Read), Type (each notification type) and Date chips go to the
  API. Rows
  show a tone dot while unread, the title, body and time ("5m", "3h"), text and tone from
  `describeNotification`. Each row has **Open …** (`openLabelFor`; marks it read and goes to its
  page) and a menu with **Mark read / Mark unread** and **Dismiss**. The header has **Mark all
  read** (`{ all: true }`, so unloaded unread ones are cleared too; with a search or filter set it
  becomes **Mark these read** and sends only the unread ones shown, `unreadIdsToMark`) and **Clear
  read** (dismisses the loaded read ones, 100 ids a request, `readIdsToClear`).
- Changes show at once (`withReadState`), then go to the API, then the badge refreshes. A failed
  request shows a toast and reloads the list. When the badge goes up while the page is open for
  any other reason than a change made here (`refresh` resolves to the new count), the first page
  reloads to show the new ones. Only the newest list request's answer is applied, so a slow page
  can't land on a newer search. Times count from the server render's clock, then tick each minute.
- The badge skips a poll while one is in flight (focus and visibilitychange often fire together)
  and applies only the newest answer.
- **Workspace activity** (`components/app/inbox/activity-feed.tsx`): `GET /api/activity`, audit
  events of every envelope in the workspace, newest first, 30 a page, as an Arc `Timeline` with
  the envelope's title and who did it. Search (envelope title, recipient or member name) and the
  Type (Signing / Sending / System, `ACTIVITY_GROUPS` in `@sahihi/core`), People (the workspace's
  members, returned with each page) and Date chips go to the API. Without a Type, link opens, OTP
  steps and filled fields are left out. Any member may read
  it; no IP addresses, user agents or hashes. A row expands to a link to its envelope.
- **Bulk sends:** the 25 most recent (`BulkSendsTable`), linking to `/bulk-sends/:id`, with a search
  over title and template and a Status chip (In progress / Finished / With failures), filtered in
  the browser (`filterBulkSends`).

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
