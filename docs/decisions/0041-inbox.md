# 0041: Inbox replaces the bell; All files replaces the Documents, Envelopes and Templates tabs

- **Status:** accepted (partly supersedes 0026's tab list, 0029's bell and 0030)
- **Date:** 2026-10-09

## Context
All files (ADR 0038) lists documents, envelopes and templates together and filters by type, so the
Documents, Envelopes and Templates pills in the top bar each showed a subset of the home page. Activity was spread
over three places: the bell (your own notifications, 100 at most, no paging), each envelope's
Activity tab (one envelope at a time), and "Recent bulk sends" under the Templates list. Nothing
showed what was happening across the whole workspace.

## Decision
- The top-bar pill is **All files · Inbox**. `/documents`, `/envelopes` and `/templates` redirect
  to `/files?type=document|envelope|template`, keeping folder and search. Their item pages
  (`/documents/:id`, `/envelopes/:id`, `/templates/:id/use|bulk`) stay, light up All files and link
  back to it. The envelope quota alert moved to All files.
- **Inbox** (`/inbox`) has three tabs through `?tab=`:
  - **Notifications**: the existing per-user notifications, as a paged list (50 at a time, "Load
    more"), All / Unread, Open, Mark read / unread, Dismiss, Mark all read, Clear read.
  - **Workspace activity**: a new `GET /api/activity` feed of audit events across every envelope of
    the workspace, newest first, keyset-paginated, filterable by group (signing, sending, system).
  - **Bulk sends**: the list that was under Templates.
- **Search and filters** on every tab, with the All files search section (`ListSearch`, no
  List / Grid): Notifications by text (the names and titles a notification quotes, a JSON path
  search) and Status / Type / Date; Workspace activity by text (envelope title, recipient or member
  name) and Type / People / Date; Bulk sends by title or template and Status, in the browser since
  the list is short. The choices are kept in the component rather than the URL, unlike All files,
  because the lists load in the browser and the tab is already in the URL.
- The bell is gone. The Inbox pill shows the unread count, polled every 60 s from
  `GET /notifications/unread-count` while the tab is visible (`UnreadCountProvider`).
- **Who sees the activity feed:** any member. A member can already open any envelope of the
  workspace and its audit trail, so the feed shows nothing new; it only puts it in one place. It
  never returns IP addresses, user agents or hashes; those stay on the envelope's own Activity tab.
- **Noise:** the feed leaves out `recipient.link_opened`, `recipient.otp_*` and
  `recipient.field_filled`. They are useful evidence for one envelope but drown a workspace feed.
- `AuditEvent` has no `organizationId`, so the query joins through `Envelope` and there is
  deliberately **no** global `occurredAt` index: with one, Postgres may walk every workspace's
  events newest first and drop the others' rows one by one. Without it, the plan starts from the
  workspace's envelopes (`Envelope(organizationId, …)`) and their events
  (`AuditEvent(envelopeId, occurredAt)`), then sorts. Adding a column would have meant
  backfilling an append-only table (ADR 0010).
- The feed's `data` is trimmed to what a line quotes (`activityData`: a reason, a file name, the
  documents added). Document and certificate hashes, emails and storage keys stay on the
  envelope's own Activity tab.
- A name search matches the acting user by name, former members included, since audit rows
  outlive membership.

## Consequences
- Arc's vendored `notification-center` and its ADR 0030 patch are no longer used. They stay vendored
  in case a popover comes back, and can be removed with the patch later.
- The Documents, Envelopes and Templates list pages' own toolbars, URL helpers and layout cookies
  are deleted; All files is the one list to improve. Drag and drop (ADR 0039), which only All files
  had, now covers every list.
- A very large workspace's feed sorts all of its events for each page. If that gets slow, add
  `organizationId` to new audit rows (outside the hash) with an `(organizationId, occurredAt)`
  index, or keep a per-workspace activity table.
- No live updates beyond the 60 s poll, as before (ADR 0029).
