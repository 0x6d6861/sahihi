# 0031: Full-page draft editor with the steps as a pill

- **Status:** accepted (supersedes the layout parts of ADR 0021 and its amendment)
- **Date:** 2026-10-07

## Context
After ADR 0026 the app shell is one top bar, and the draft editor (ADR 0021) sat under it with its
own bar and a left step rail (a static coss `Sidebar`, an Arc `Drawer` on phones). That stacked two
top bars on the page, spent a column on four steps and a handful of quick actions, and gave the
steps a different look from the app's own navigation. The PDF, which is the work, got what was
left.

## Decision
- **Full page.** On the editor route (`isFullPage()` in `lib/nav.ts`, today only
  `/envelopes/:id/edit`) the app shell renders no top bar and no column: the page fills the window.
  The editor's back link leads out (to Envelopes), where the app's navigation returns.
- **The steps are the app's pill.** The top bar's segmented pill is now a shared composition,
  `components/app/pill-nav.tsx` (`PillNav`), used by both bars: links for the app sections, buttons
  for the steps (`aria-current="step"`). A step that isn't open yet (fields and preview before a
  signer or approver) is `aria-disabled`, and an Arc `Tooltip` on every step says what it's for or
  why it's closed (`stepHint`).
- **No rail.** The editor's bar (`envelope-editor/editor-header.tsx`) holds everything the rail
  did, laid out like the app bar:
  - **Left:** back to Envelopes (icon button with an Arc `Tooltip`), the title and the status `Badge`.
  - **Centre:** the steps pill (its own full-width row below `md`, labels only below `sm`).
  - **Right:** an Arc `DropdownMenu` "Actions" (Save as template, Download original, Open document,
    Activity) and **Send**. Save as template opens the existing dialog (now controllable, no
    trigger) and Activity an Arc `Drawer`.
- "Step n/4" and the progress bar go: the pill shows where you are and what's left.

## Consequences
- The app's notification bell and account menu aren't on the editor page. Back to Envelopes (or
  Send) returns to them.
- `useSendCheck`, `stepProgress`, the step titles and `components/app/envelope-editor/step-rail.tsx`
  are gone; `isFullBleed` is now `isFullPage`.
- The draft editor no longer uses coss `Sidebar`; the app has no coss `SidebarProvider` left.
- The menu was labelled "Actions", not "More": the PDF editor's toolbar already has a "More actions"
  button on the same screen. (Since replaced by a split button, see the amendment.)

## Amendment (2026-10-07): a split button instead of the Actions menu
The right side of the bar is an Arc `split-button` (installed with `/add-ui`, not edited) instead of
the "Actions" `DropdownMenu`. **Save as template** is its main half, the action people reach for
most from a draft. Download original, Open document and Activity sit behind its chevron. On a
draft with no recipients the main half still opens the dialog, which explains that a template needs
one and offers **Add recipients** (to that step), rather than a disabled button with no reason.
The split button doesn't shrink, so below `sm` the buttons take their own row under the title.
