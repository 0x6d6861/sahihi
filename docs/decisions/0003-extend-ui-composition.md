# 0003: Compose Extend UI's PDFViewer for the field editor instead of editing ESignatureBlock

- **Status:** accepted. Amended by [0006](0006-pdf-editor-roles.md) (the field editor uses `PDFEditor` as its shell)
- **Date:** 2026-09-26

## Context
UI must use only default coss and Extend components. Extend's `ESignatureBlock` is a demo block that
takes only a `file` prop and keeps its field state internally, so it can't be bound to our API without
modifying vendored code. `PDFViewer` exposes `renderPageOverlay` and page pointer events.

## Decision
- Keep all vendored registry files unmodified.
- Build the field editor and signing surface in `apps/web/components/app/` from `PDFViewer` +
  `renderPageOverlay` + our pure geometry helpers (`lib/field-geometry.ts`), rendering fields with
  coss primitives and Extend E-Signature parts where they are exported.
- Store coordinates normalized (0–1, top-left, displayed page). See `docs/coordinates.md`.

## Consequences
- Registry updates stay painless (re-add, no merge conflicts).
- We own the editor interaction code (drag, resize, keyboard), and it is unit-tested where pure.
- If a future Extend release exposes controlled props for E-Signature, revisit this ADR.
