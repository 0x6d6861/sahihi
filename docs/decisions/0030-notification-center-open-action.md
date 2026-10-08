# 0030: "Open" action in Arc's notification center (local patch)

- **Status:** accepted
- **Date:** 2026-10-07

## Context
The bell in the top bar is Arc's `notification-center` block (docs/notifications.md). Every
notification is about something with a page: an envelope, a bulk send, Settings → Data, Members or
Plan & usage (`describeNotification(...).href` in `@sahihi/core`). The block has no way to go
there. A row's button expands it, the expanded row offers only Mark read / Mark unread and
Dismiss, and `NotificationItem` has no link or action field. So the bell could tell a sender "Amina
declined “Lease”" but not take them to the envelope, which is the next thing they want to do.

The app can't add this from outside. The block renders its rows itself, takes plain strings for the
title and description, and keeps its own copy of the list. AGENTS.md rule 2 allows a change to a
vendored component with an ADR.

Alternatives considered:
- **Back to the hand-composed popover.** It linked rows, but it means maintaining our own
  notification UI next to Arc's, against ADR 0023.
- **Navigate when a row is chosen.** This would replace the block's expand behaviour (and the Mark
  unread / Dismiss actions behind it), and change what its accessible names announce.
- **Put the place in the description text.** This is what we did meanwhile. It tells people where
  to go but doesn't take them there.

## Decision
Patch `components/arc/notification-center/notification-center.tsx`, additively:

- `NotificationItem.openLabel?: string`, the text of the item's open action ("Open envelope").
- `NotificationCenterProps.onOpen?: (notification: NotificationItem) => void`.
- When both are set, the expanded row's actions start with a button showing an `ArrowUpRight` icon
  and `openLabel`, which calls `onOpen(item)`. It uses the same `itemActions` styles as Mark read
  and Dismiss, so no CSS changes.

Every patched line is marked `sahihi patch (ADR 0030)`. Without `onOpen` and `openLabel` the block
behaves exactly as shipped.

The app's bell controls the panel's `open` state. `onOpen` closes the panel, marks the item read on
the server if it was unread, and navigates to the item's page. Labels come from the destination
(`openLabelFor` in `lib/notifications.ts`).

## Consequences
- After reinstalling `@uiarc/notification-center`, re-apply the patch (search the old file for
  `sahihi patch (ADR 0030)`).
- An item opened while unread is shown as read when the bell next reloads its list, not instantly,
  because the block keeps its own state. The panel is closed by then, so nobody sees the gap.
- If Arc adds an action or link slot to `NotificationItem` upstream, switch to it and drop the
  patch.
