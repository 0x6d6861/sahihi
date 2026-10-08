# Signing flow

## Drafting

**Documents and supporting files (ADR 0037).** An envelope holds up to 10 documents to sign (500
pages in all), in order, plus up to 10 supporting files that recipients can download but don't
sign (PDF, images, Office files, CSV, text; 25 MB each). The editor's first step, "Documents",
adds documents (from the library, or upload), reorders and removes them, and prepares the pages
of any one of them. `PUT /envelopes/:id/document` takes `envelopeDocumentId` and drops only that
document's fields. Every field has an `envelopeDocumentId`. Sending waits until no supporting
file is still uploading; `envelope.sent` records every document's and file's name and hash.


1. `POST /api/envelopes { documentId, title, message?, signingOrder, expiresAt? }` creates a `DRAFT`
   (audit `envelope.created`). The document must be `READY`.
   Web: `/envelopes/new?documentId=…` (from the document page's "Create envelope" or the envelopes
   list). The form validates with the same `CreateEnvelopeSchema` (`lib/envelope-form.ts`) and maps
   both client and API `issues[]` onto each Arc field's `error`. The title defaults to the file name. "Sign
   in order" is a `Switch` for `SEQUENTIAL`. Expiry is a date (Arc `DatePicker`, past days
   disabled) sent as the **end of that day in the sender's time zone**.
2. `PUT /api/envelopes/:id/recipients` replaces the full list. Emails are unique per envelope, and
   `SMS_OTP` needs a phone number. Both are enforced in `ReplaceRecipientsSchema`, so the API
   reports them as field issues (`recipients.<i>.email` / `.phone`). `order` only matters for
   `SEQUENTIAL` (equal numbers sign in parallel); parallel envelopes store `1`. `colorIndex` is the
   list position, used for the editor colours.
   Web: `components/app/recipients-editor/` on the DRAFT envelope page. Each row has name, email,
   role `Select`, verification `Select`, a step `NumberField` (sequential only) and a phone `Input`
   (shown for SMS). It validates with the same schema via `lib/recipients.ts` and shows
   client/API issues per field.
3. `PUT /api/envelopes/:id/fields` replaces all fields (editor autosave). Each field belongs to one
   recipient and **VIEWERs can't own fields**.

Recipients and fields are editable only while the envelope is `DRAFT`.

### Field placement (editor, roadmap P2)

Route: `apps/web/app/(app)/envelopes/[id]/`. Build it from defaults:

- **Extend `PDFEditor` in view-only mode** as the shell (thumbnails, search, zoom, toolbar), with
  every editing feature off (see `ui.md` → PDFEditor configurations). `renderPageOverlay` renders our
  field layer for each page. The layer handles its own pointer events (the editor has no
  `onPagePointer*` props) and calls `stopPropagation` so the editor's selection doesn't react
- Don't use the editor's `forms` mode for our fields. It has no signature-field tool, it writes
  AcroForm widgets into the PDF bytes, and it has no concept of recipients
- **coss** `Toolbar` + `ToggleGroup` (field type), `Select` (active recipient), `Tooltip`,
  `Popover` (field properties: required, label), `Kbd` hints, `Button`
- Thumbnails come from the editor's left sidebar, so there's no separate `DocumentViewerSidebar`
- Geometry comes from `lib/field-geometry.ts` only (see `coordinates.md`). Colours come from
  `RECIPIENT_COLORS[colorIndex]`
- State is a local array of `FieldInput`, debounced autosave (~800 ms) to `PUT …/fields`, with a
  "Saved/Saving…" indicator
- Keyboard: arrows nudge the selected field (Shift for ×10), Delete removes it, Esc deselects

Implementation (`components/app/field-editor/`):
- `field-editor.tsx`: the PDFEditor shell (dynamic import, `VIEW_ONLY_FEATURES`), a stable
  `renderPageOverlay`, and state from `useReducer(editorReducer)` (`lib/field-editor.ts`, pure and
  tested). A `syncRecipients` action drops fields when recipients are removed or turned into viewers.
- `field-layer.tsx`: one layer per page. Pointer handling uses React **capture** handlers that stop
  propagation, because EmbedPDF's page listeners are native bubble listeners and would otherwise see
  the event first. Positions are measured in the layer's **local** box (`offsetX` plus the
  `offsetParent` chain), not `getBoundingClientRect()`. The overlay sits inside the viewer's CSS
  rotate wrapper, and the view toolbar keeps its rotate buttons even with `pages: false`, so
  client-rect maths would break after a view rotation. A click drops the type's default size; a drag
  of at least 1% draws the rect.
- `field-toolbar.tsx`: coss `Toolbar` with a `ToggleGroup` (select tool + 7 field types, `Tooltip`),
  a recipient `Select` (non-viewers only, with colour dots), and a properties `Popover` for the
  selected field (recipient, label, required `Checkbox`, delete). Also `Kbd` hints and the save status.
- `use-autosave.ts`: 800 ms debounce, never two saves in flight (a change during a save queues one
  follow-up), a `beforeunload` guard while unsaved, and Retry on error.

### Preparing the document (optional, roadmap P2)

Before creating an envelope, a sender can open the document in the **full `PDFEditor`** to redact,
rotate, delete or reorder pages, fill existing form fields, or flatten. On save:

1. `applyRedactions()` first. Redaction marks are only marks until applied, and
   `getDocumentBuffer()` would otherwise keep the covered content. The confirm dialog says so.
2. `getDocumentBuffer()` → the normal upload flow (`uploadPdf` in `lib/upload-client.ts`:
   `POST /documents/uploads { …, sourceDocumentId }` → PUT → `complete`). The server re-inspects and
   re-hashes the bytes like any upload.
3. The result is a **new** `Document` named `<name> (prepared).pdf`, with its own hash and linked
   with `sourceDocumentId`. The API only accepts a `READY` source in the caller's org (404 otherwise).
4. The original is never modified. `sourceDocumentId` is `ON DELETE SET NULL`, so it records
   lineage only.

Web: `/documents/[id]/prepare` (`components/app/prepare-document/`). The detail page has a
"Prepare" button and shows "Prepared from …"; the list shows the source under the name.

### Sending

`POST /api/envelopes/:id/send` runs these preflight checks (`sendPreflight()` in `@sahihi/core`,
which returns **every** issue) and returns 400 `{ error: "preflight_failed", message, issues[] }`
while any remain. `GET /api/envelopes/:id/preflight` returns the same `issues[]` without sending.
The checks:

- at least one non-VIEWER recipient
- every `SIGNER` has at least one `SIGNATURE` field
- `SMS_OTP` recipients have a phone number (E.164)
- `expiresAt` is in the future

Then, in one transaction: `DRAFT → SENT`, audit `envelope.sent`, and `activateNextRecipients()`,
which issues links (raw token returned, hash stored), sets recipient `SENT`, and audits
`recipient.notified`. **After commit**, one `envelope.invite` job is enqueued per link.

Link lifetime is `min(now + SIGNING_LINK_TTL_DAYS, envelope.expiresAt)`.

Web: an editable draft opens in the **draft editor**, a full page without the app's bar
(`app/(app)/envelopes/[id]/edit/`, ADR 0021, ADR 0031); `/envelopes/:id` redirects it there and
shows everything else read-only. The editor's own top bar has the four steps as a pill, in
`?step=` (Document, optional, ADR 0024 → Recipients → Fields → Preview), a split button (**Save
as template**, with download original, open document and activity behind its chevron) and **Send**. Send first settles the draft editors
(`components/app/envelope/draft-state.tsx`): the field autosave is flushed, and unsaved recipient
edits block with a message. It then calls `preflight` and lists the issues inline in an `Alert`,
each with a **Fix** link to the step that fixes it. Only a clean preflight opens **Review & send**
(`components/app/envelope/review-send-dialog.tsx`): title, message,
signing order and expiry, prefilled from the draft. Send saves them with
`PUT /api/envelopes/:id/details` and then sends; "Save changes" only saves them. Turning "sign in
order" on numbers the recipients by their list position; turning it off puts everyone on step 1.
After sending, the sender lands on the read-only envelope page. The
steps stay mounted when hidden, so switching can't drop a pending save. The read-only page has
Tabs Document / Recipients / Activity (`?tab=`). Activity (also a `Sheet` in the editor) lists the
audit trail with readable labels (`lib/audit-labels.ts`) and the hash-chain check from `GET …/audit`.

## Signing (public: `/sign/[token]`)

`GET /api/sign/:token` returns a `state`:

| state | meaning | UI |
|---|---|---|
| `ready` | the recipient can act now | OTP step if required, then the signing surface |
| `waiting` | sequential and not their turn | "Not your turn yet" |
| `signed` | they already signed | thanks, wait for completion |
| `completed` | everyone signed | download links |
| `declined` / `closed` / `expired` | terminal | explanation |

Unknown or malformed tokens return 404 `invalid_link`. Never reveal whether the token ever existed.

### Verification (OTP)

When `verification` is `EMAIL_OTP` or `SMS_OTP`:

1. `POST /:token/otp` creates a 6-digit code (hashed with the recipient id, 10-minute TTL), audits
   `recipient.otp_sent`, and enqueues `recipient.otp`. Limited to 5 requests per 15 minutes per token,
   with a **30-second resend cooldown** enforced by the server (`OTP_RESEND_COOLDOWN_MS`,
   `otpResendWaitSec()` in `@sahihi/core`). Inside the cooldown it returns 429
   `{ error: "otp_cooldown", retryAfterSec }` with a `Retry-After` header. A successful send returns
   `{ sentTo, resendAfterSec }`.
2. `POST /:token/otp/verify` allows at most 5 attempts per code, compared in constant time. Audits
   `otp_verified` or `otp_failed`. On success it sets a signed, httpOnly `sahihi_signer` cookie
   (30 minutes, `path=/api/sign`).
3. Fields, page metadata and the file URL are only returned once verified.

UI: Arc `OtpInput length={6}` (numeric, `autocomplete="one-time-code"`) inside a `Panel`. It
verifies automatically when the sixth digit is entered. On a wrong code the slots clear and the
error shows on the field. "Resend code in 0:27" counts down from the server's `resendAfterSec`
(or `retryAfterSec` after a reload), and there are specific messages for the 15-minute rate limit
and for too many attempts.

### Signing surface

With several documents (ADR 0037) the session returns `documents[]` in order and fields in
reading order (document, page, top to bottom). An Arc segmented control switches documents and
shows how many required fields are left on each. "Next field" walks every document and switches
when needed. `GET /sign/:token/file?document=<envelopeDocumentId>` returns each original. Verified
recipients see "Supporting files" under the message. `GET /sign/:token/attachments/:id` returns a
download (never inline) and records `recipient.attachment_viewed`.


- `GET /:token/file` returns a presigned URL for the original PDF. The **first call** marks the
  recipient `VIEWED` (and the envelope `IN_PROGRESS`) and audits `recipient.viewed`.
- Render with Extend `PDFViewer` and overlay **only this recipient's fields** (`rectStyle`).
- Clicking a signature or initials field opens the Extend **E-Signature** signature dialog
  (draw / type / upload), which produces a PNG data URL. Reuse the adopted signature for the other
  fields on request.
- A "Next field" button walks through required fields in order (page, then y). A coss `Progress`
  shows how many are complete.
- Before submitting: a coss `Checkbox` for "I agree to sign electronically…" (the consent text is
  versioned, see `security.md`).
- `POST /:token/submit { consent: true, consentVersion, values }` → an outdated `consentVersion` gets 409 `consent_outdated` (see `security.md`); otherwise the server validates required fields, stores
  PNGs, sets recipient `SIGNED` with a guarded update (so a double submit returns 409), audits
  `recipient.consented` and `recipient.signed`, then either:
  - **everyone has signed**: envelope `COMPLETED` + audit + enqueue `envelope.finalize`
  - **otherwise**: `SENT → IN_PROGRESS` if needed + `activateNextRecipients()` (the next sequential
    step) and enqueue invites
- `POST /:token/decline { reason }` → recipient `DECLINED`, envelope `DECLINED`, notify the sender.

Implementation (`components/app/signing/`, state in `lib/signing.ts`, pure and tested):
- `signing-surface.tsx` loads `GET /:token/file`, which marks the recipient viewed, and renders
  `signing-viewer.tsx` (Extend `PDFViewer` via `next/dynamic`, no upload or download).
  `renderPageOverlay` draws only this recipient's fields with `rectStyle`:
  - signature and initials: a button that opens the capture dialog
  - text: a `Popover` with an `Input`
  - checkbox: the coss `Checkbox`
  - DATE_SIGNED, NAME and EMAIL: a muted preview, because the server fills them
- A sticky bar shows `Progress` (required fields filled) and "Next field", which walks the fields in
  reading order (page, then y, then x), required first, wrapping round (`nextFieldToFill`). It uses
  `scrollToPageArea` and focuses the field.
- The capture dialog (`signature-capture-dialog.tsx`, ADR 0008) offers Draw, Type and Upload, crops
  the result to its ink, and offers "Use this signature" once one has been adopted.
- The consent `Checkbox` shows `CONSENT_TEXT` from `@sahihi/core`. Submit stays disabled until it's
  ticked. Missing required fields, whether found by the client or reported by the API
  (`missing_required_fields`), are outlined in red, and the page scrolls to the first one. A 409
  reloads the state.
- Decline opens a `ConfirmDialog` that needs a reason.

## Sender actions

- **Remind**: `POST /:id/recipients/:rid/remind` rotates the link (the old one stops working),
  audits `recipient.reminded` (with the sender as actor) and sends `envelope.reminder`.
  - Throttled, because every reminder emails the recipient and rotates their link: at most one per
    hour, counted from the latest invite or reminder (`MANUAL_REMINDER_COOLDOWN_MS`). Otherwise the
    response is 429 `reminder_cooldown` with `retryAfterSec` and `Retry-After`.
  - A recipient who has already responded, isn't invited yet (a later sequential step), or is on a
    closed envelope gets 409 with the reason (`already_done`, `not_their_turn`, `envelope_closed`).
    Another org gets 404.
  - `reminderAvailability()` in `@sahihi/core` decides this for both the API and the UI.
- **Void**: `POST /:id/void { reason }` is allowed from `SENT` or `IN_PROGRESS`. It clears every
  recipient's `tokenHash`, so old links return `invalid_link`, audits `envelope.voided` and notifies
  recipients.
- **Automatic**: `envelopes.remind` runs daily at 09:00 EAT, and sends at most 3 reminders per
  recipient, rotating the link each time. `envelopes.expire` runs hourly and moves envelopes past `expiresAt` to `EXPIRED`.

Web (`components/app/envelope/sender-actions.tsx`, on sent envelopes):
- Each row in the Recipients tab has a `Menu` with "Send reminder" (disabled with the reason, e.g.
  "Available again in 42 min" or "Not their turn yet", from `reminderHint()`) and "Copy email".
- The header has **Copy status**, which puts a plain-text summary on the clipboard
  (`statusSummary()` in `lib/envelope-status.ts`: title, state, n of m signed, expiry, one line per
  recipient). Signing links can't be copied, because raw tokens are never stored.
- While the envelope is `SENT` or `IN_PROGRESS`, the header also has **Void**, which opens a
  `ConfirmDialog` that requires a reason.

## Completion

The finalize job (see `pdf-pipeline.md`) produces `signed.pdf` and `certificate.pdf`, then
`envelope.completed` emails everyone fresh links to `/sign/<token>` (state `completed`, downloads).
Senders download from `GET /api/envelopes/:id/downloads`.
