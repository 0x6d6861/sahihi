# 0036: One list experience for Documents, Envelopes and Templates

- **Status:** accepted
- **Date:** 2026-10-08

## Context
Documents got Drive-style search and chips (ADR 0035), a thumbnail grid (ADR 0033) and ⋮ menus
(ADR 0034). Envelopes and Templates still differed. Envelopes had stage tabs over at most 50 rows
fetched once and filtered in the browser. Templates had a client-sorted Arc table over at most 100
rows. Neither page could search. Status showed as text badges and people as plain names.

## Decision
- **Same section on every list page.** `components/app/list-search.tsx` (`ListSearch`) has the
  filled search bar, the chip row with "Clear filters", and List / Grid.
  `useListNavigation` handles the URL changes and saves the layout. Each page has a thin toolbar
  that builds its own chips:
  - Documents: Status, People, Added, Tags, Color.
  - Envelopes: **Status** (the stages Drafts / In progress / Completed / Closed; this replaces
    the stage tabs and their counts), Sent by, Created.
  - Templates: Saved by, Created.
- **Search and paging run on the server.** `GET /api/envelopes` and `GET /api/templates` take
  `ListEnvelopesQuerySchema` and `ListTemplatesQuerySchema` (`@sahihi/core`). They return 25 rows
  a page, newest first, with `total` and the chip options (`senders`, `savers`). Envelope search
  matches the title, the document name, and a recipient's name or email. Template search matches
  the name, the description and the document name. The stages live in `@sahihi/core`
  (`ENVELOPE_STAGE_STATUSES`) so the API and the web agree. Both lists return each item's document
  thumbnail as `thumbnailUrl` (`presignCacheable`, ADR 0033). The storage key stays inside the
  API.
- **One grid.** `ListCard` and `ListGrid` (`components/app/list-card.tsx`) are the Drive-style
  tile and grid. `DocumentCard`, `EnvelopeCard` and `TemplateCard` fill in its slots. Clicks on
  the footer go through to the card's link; only the status icons and avatars sit above it, so
  their tooltips work. Each page keeps its own layout cookie (`lib/list-layout.ts`).
- **Status as icons.** `StatusIcon`, `EnvelopeStatusIcon` and `DocumentStatusIcon`
  (`components/app/status-icon.tsx`) replace the status text badges in lists and cards. The icon
  is coloured by the badge tone, has `role="img"` and the status name as its label, and shows an
  Arc tooltip on hover. It is not a tab stop. Ready documents show no icon; ready is the normal
  state.
- **People as avatars.** `Person` (one Arc `Avatar`, with or without the name) and `People` (Arc
  `avatar-group`, newly installed, "+N" past 3) show senders, uploaders, savers and recipients.
  The lists now return `image` for users. Recipients aren't users, so they show initials.
- **Signing progress as a ring.** `ProgressRing` (`components/app/progress-ring.tsx`) is a small
  static SVG: a track and a clockwise arc, `info` while under way and `success` when done. It has
  `role="img"` and a label ("2 of 3 signed"), and the visible count sits beside it. Arc, coss and
  shadcn have no circular progress (checked at the time of writing). This is a non-interactive
  drawing put together from tokens, so it does not count as the kind of hand-written primitive
  AGENTS.md rule 1 forbids. If Arc ships one, switch to it.
- **Type icons.** Documents keep the red PDF mark. Envelopes (mail) and templates (layout) use
  neutral marks (`components/app/type-icons.tsx`), because colour on these pages means status.
- **Menus.** Every row and card has the ⋮ menu (ADR 0034). The envelope menu is new: Open (or
  "Continue editing" for a draft the caller may edit) and Open document. State changes stay on
  the envelope page, where they can be explained and confirmed. The template menu is the old one
  with a ⋮ trigger; "Use template" stays as a visible button on wide rows.
- Templates now use the same coss `Table` as the other lists. Sorting columns in the browser
  would only sort one page.

## Consequences
- The envelope stage counts are gone. The header shows the total of the current search.
- Envelope search uses `contains` on four columns, one of them through recipients. That is fine
  at the current size; add trigram indexes if lists grow into the tens of thousands.
- `lib/envelope-list.ts` no longer has `ENVELOPE_VIEWS` or `viewCounts`. Old `?view=` links
  fall back to all envelopes.
- The public API (`/api/v1/envelopes`) is unchanged.
