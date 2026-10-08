# 0021: Full-screen draft envelope editor with steps

- **Status:** accepted (amended 2026-10-07: the editor now sits inside the app shell, see below; layout superseded by ADR 0031)
- **Date:** 2026-10-07

## Context
A draft was edited on the envelope page inside the app shell: Tabs (Document / Recipients /
Activity), Send in the header, and the field tools squeezed into the PDF editor's second toolbar
row (ADR 0019). The PDF got what was left after the app sidebar and page padding, the field types
were icon-only, and a selected field's settings sat behind a popover. Senders also had no sense of
order: nothing said "recipients first, then fields, then send".

## Decision
- An editable draft (`DRAFT` and `permissions.manage`) opens at `/envelopes/:id/edit`, in a new
  route group `app/(editor)/` whose layout does the same session/workspace checks as `(app)` but
  renders **no app shell**. `/envelopes/:id` redirects editable drafts there, and the editor
  redirects anything else back. The read-only envelope page keeps its Tabs for everyone else.
- Layout (`components/app/envelope-editor/`): a top bar (title, status badge, document name,
  **Send**), a left rail on coss `Sidebar` (a sheet below `md`) with "Step n/3" + `Progress`, the
  three steps and quick actions (send, save as template, download original, open document,
  activity in a `Sheet`, back to envelopes), and the current step in the rest:
  1. **Document & recipients**: document card + the existing `RecipientsEditor`.
  2. **Add fields**: `FieldEditor` with `toolsPlacement="aside"`.
  3. **Preview**: `PDFViewer` with a read-only field overlay and fields per recipient.
  The step lives in `?step=` (`lib/envelope-editor.ts`); steps 2 and 3 wait for a signer or
  approver. Steps 1 and 2 stay mounted while hidden, as the tabs did, so a step switch never
  drops the field autosave or unsaved recipient edits.
- **Field tools beside the editor, not in it.** `FieldEditorSurface` puts `FieldPalette`
  (recipient `Select`, one outline `Toggle` per field type with its label, Detect fields, the
  selected field's settings inline) in a 288px column right of the PDF editor, and a "Fields"
  `Sheet` below `lg`. The editor's second row (`ribbonContent`, ADR 0019) only carries a hint and
  the autosave status.
- Send moved from `SendControl` to `SendProvider` / `SendButton` / `SendProblems`
  (`envelope-editor/send-context.tsx`); preflight "Fix" links open a step (`FIX_STEP`) instead
  of a tab. A clean preflight opens the **Review & send** dialog (taken over from the composer,
  `components/app/envelope/review-send-dialog.tsx`), prefilled from the draft: title, message,
  signing order and expiry are saved with a new `PUT /envelopes/:id/details` (draft only,
  `UpdateEnvelopeDetailsSchema`) before sending, or alone with "Save changes". After sending, the
  sender lands on the read-only envelope page.
- Only defaults: coss `Sidebar`, `Progress`, `Badge`, `Toggle`, `Sheet`, `Card`; theme tokens;
  no vendored file changed.

## Consequences
- **The `/send` composer (ADR 0018) is removed**, with `POST /api/envelopes/compose`,
  `lib/compose.ts`, `ComposeEnvelopeSchema` and the field toolbar row. One way to send remains:
  create a draft (`/envelopes/new`, or "Create envelope" on a document, a document row or the
  upload toast), then the draft editor. "Send now" on a template is unchanged.
- ADR 0024 adds a first, optional step: Prepare document.
- Links to `/envelopes/:id` keep working for drafts through the redirect, but `?tab=` is dropped
  on the way.
- No "duplicate" or "delete draft" quick actions: there's no API for either yet.

## Amendment (2026-10-07): inside the app shell
Leaving the shell cost senders the app navigation and the workspace switcher mid-edit. The route
moved to `app/(app)/envelopes/[id]/edit/` and the `(editor)` group is gone. `AppShell` renders
**full-bleed** pages (`isFullBleed()` in `lib/nav.ts`, today only `/envelopes/:id/edit`) without
the centred `max-w-6xl` column, with the inset pinned to the window height so the editor scrolls
inside. The step rail no longer opens its own `SidebarProvider`: a collapsible coss `Sidebar` is
`fixed` to the window's left edge (it would cover the app sidebar) and a second provider would
also answer ⌘B and write the shell's `sidebar_state` cookie. It is now a static
`Sidebar collapsible="none"` column on `md+` and the content of an Arc `Drawer` (side left) on
phones, opened from the editor's top bar. ⌘B collapses the app sidebar to its icon rail, giving
the PDF more room. No vendored file changed.
