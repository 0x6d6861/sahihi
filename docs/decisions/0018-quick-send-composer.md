# 0018: Quick send composer and the "created but not sent" answer

- **Status:** superseded by 0021 (composer removed 2026-10-07)
- **Date:** 2026-10-05

## Context
Sending one PDF to one signer took five screens: upload, the document page, the new-envelope form,
the Recipients tab with an explicit save, then the Document tab and Send. Each step persisted
something, so the sender waited on the server twice before even placing a field. The public API
already created an envelope with its recipients and fields in one transaction and could send it
in the same call (ADR 0017), but the web app never used it.

## Decision
- Add a "Send for signature" composer at `/send`, **alongside** the step-by-step flow. It keeps
  recipients and fields in memory and makes one `POST /api/envelopes/compose` call on Send or
  Save as draft. The body is the public API's (`ComposeEnvelopeSchema` = `ApiCreateFromDocumentSchema`),
  and the route reuses `createEnvelopeFromDocument` and `sendEnvelope`, so no new envelope logic exists.
- Share the editors instead of forking them: `FieldEditorSurface` (field placement without
  persistence) and `RecipientRows` (the controlled rows) are used by both the draft page and the
  composer; the draft page keeps its autosave and explicit recipients save.
- **Created but not sent is a success:** the draft is committed before sending, so when the send is
  refused (preflight, plan quota, invalid state) the web routes answer 201
  `{ envelope: { id }, sent: false, error, message }` instead of an error. The client sends the
  sender to the draft to finish it. The public API keeps its existing behaviour (the send error is
  returned; the draft exists), since changing it would break integrators.
- "Send now" on a template uses the same contract (`send: true` on `POST /templates/:id/envelopes`,
  validated by `UseTemplateRequestSchema` so other callers of `UseTemplateInput` are unchanged).

## Consequences
- Two ways to send exist until one is retired; `docs/signing-flow.md` describes both.
- Clients of the compose and template routes must read `sent`, not only the status code.
- Work in the composer is lost if the page is closed before submitting; a `beforeunload` guard warns.
- Removing the composer means deleting `app/(app)/send/`, `lib/compose.ts` and the compose route;
  the shared editor parts stay valid for the draft page.
