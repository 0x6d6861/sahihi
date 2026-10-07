# 0019: App panels and toolbar row in PDFEditor (local patch)

- **Status:** accepted
- **Date:** 2026-10-05

## Context
The "Send for signature" composer (ADR 0018) lists the signers beside the PDF. Extend's
`PDFEditor` already has a resizable right-side panel (Properties, Comments, Stamps…) with its own
toolbar button and header, but the set of panels is fixed: there is no prop to add an app's own.
Building a look-alike panel next to the editor would sit beside its toolbar instead of under it,
and duplicate the resizing and narrow-screen overlay behaviour. AGENTS.md rule 2 says vendored
components change only with an ADR.

## Decision
Patch `components/extend/pdf-editor.tsx` with one optional prop, `customPanels`, plus
`defaultCustomPanel`:

```ts
type PdfEditorCustomPanel = {
  id: string
  label: string          // toolbar tooltip / accessible name
  icon: React.ReactNode
  render: (panel: { close: () => void }) => React.ReactNode
}
```

- Each entry gets a toolbar button right after "Details panel".
- Its `render()` output shows in the editor's own right panel (same `PdfEditorWorkspace`, same
  inline vs overlay behaviour). Use `PdfEditorPanelHeader` (exported from `pdf-editor-shared`) for
  the header.
- A custom panel and a built-in right panel are never open together: opening one closes the other.
- `customPanel` / `onCustomPanelChange` make the open panel controllable, and
  `toolbarButton: false` drops a panel's main-toolbar button, so the app can toggle it from its own
  control. The composer's Signers toggle lives in the field-tools row this way.
- `ribbonContent?: ReactNode` replaces the editor's second toolbar row (mode switch and mode
  tools) with app tools. The field editor puts its tools there (`FieldToolbar`: field types,
  recipient picker, field settings, save status), so field placement is one editor with one
  toolbar on the draft page and in the composer. The row keeps its border and background.
- Without these props the editor behaves exactly as before (prepare page).

Every changed hunk is marked `sahihi patch (ADR 0019)`, all in `pdf-editor.tsx`.

## Consequences
- After reinstalling `@extend/pdf-editor`, re-apply this patch along with the `spacing` patch
  (ADR 0007): search the old file for `sahihi patch (ADR 0019)` and port each hunk, then run
  `bun run typecheck` and the composer check in docs/signing-flow.md → Quick send.
- If Extend adds a panel extension point upstream, switch to it and drop the patch.
- Since ADR 0021 the field tools sit in a panel beside the editor and `ribbonContent` only carries a
  hint and the save status. The composer that used `customPanels` was removed with ADR 0021, so
  that part of the patch is unused; keep it (or drop it at the next reinstall) as you prefer.
