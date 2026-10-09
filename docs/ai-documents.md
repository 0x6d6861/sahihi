# AI-generated documents

Members draft a document with an AI assistant, fill in every blank, name the signers, then
**finalise**. Finalising renders a PDF, stores it as an ordinary READY `Document` and creates a DRAFT
envelope with the signers as recipients and their fields already placed. From there the existing
flow takes over (Review & send → sign → certificate). See ADR 0042.

What ships today (roadmap P6): one starter (Mutual NDA), the assistant's questions and blank
filling, a rich-text editor for the wording (sections, blanks, lists, tables, bold, italic,
underline), assistant edit proposals with a diff to accept or reject, signers and their fields
(signature, initials, full name, date signed, text, checkbox; initials on every page), set by the
person or proposed by the assistant, a PDF preview, finalise. Not yet: more starters, saving a
generated document as a template.

## Availability

Three switches, all required (`requireAssistant` in `routes/generated-documents.ts`):

1. **Server:** `AI_MODEL` is set (`provider:model`, `anthropic:` or `openai:`, with that provider's
   key; `packages/config`). Unset = off everywhere.
2. **Workspace:** `WorkspaceSettings.aiEnabled`, off by default because document text goes to the
   model provider. Owners and admins turn it on (`PUT /api/generated-documents/settings`, or the
   button on `/generate`).
3. **Role:** `ai:use` (`canUseAssistant`). Every role has it today; the statement exists so it can
   be narrowed without a migration.

Who may change a generated document follows the envelope rule (`canEditGeneratedDocument`): its
creator, or an admin or owner. Everyone in the workspace can open it.

## Model (`packages/core/src/generation/`, `schema.prisma` section 3)

The source of a document is structured, never Markdown: a ProseMirror-compatible tree
(`DocContentSchema`) plus data next to it (`GeneratedDocumentDataSchema`):

| Part | What |
|---|---|
| `section` | A clause with a stable `id` and a `title`. Its number follows from its position (`numberSections`); `numbered: false` skips numbering |
| `paragraph`, `bulletList`, `orderedList` | Text. Inline nodes are `text` (bold, italic, underline) and `variable`. A list item is one paragraph |
| `table` | A plain grid of `tableRow`s of `tableCell` / `tableHeader` cells holding paragraphs. Every row has the same number of cells; no merged cells |
| `variable` node | An atomic blank pointing at `variables[key]`. The value never sits in the text |
| `signatureBlock` | Where one signer role signs: caption paragraphs and `field` nodes (`SIGNATURE`, `INITIALS`, `NAME`, `DATE_SIGNED`, `TEXT`, `CHECKBOX`) |
| `variables[]` | `key`, `label`, `type`, `hint`, `value` (null until filled), `status` (`unresolved`, `answered`, `skipped`), `source` (`answer`, `chat`, `edit`) |
| `roles[]` | Signer roles: `key`, `label`, `SIGNER` or `VIEWER` (gets a copy), the contact (`name`, `email`), and `initialsOnEveryPage` (signers only) |

Signer identity is data: emails exist only in `roles`, and party names in the body are blanks, so
the text and the signer list can't disagree. `structureIssues` checks the references the schema
can't (unknown blank or role, duplicate ids, a viewer with fields, a ragged table).

**Versions.** `GeneratedDocumentVersion` rows are immutable (a database trigger refuses UPDATE).
Every change appends version `n + 1` and names the version it started from: a stale base is a 409
(`stale_version`), so two tabs can't overwrite each other. The latest version is the current one.
`GeneratedDocumentEvent` is the append-only trail of what happened (who, the version, which keys),
never prompts or model output. `GeneratedDocument.messages` keeps the conversation for reload.

## Starters

Curated documents in code (`starters.ts`): fixed, reviewed wording, every specific a blank. A test
checks each starter is valid, uses every blank it declares and prefills nothing.

## The assistant (`apps/api/src/lib/assistant/`)

`POST /api/generated-documents/:id/chat` streams one turn (Vercel AI SDK `streamText`, UI message
stream). The server builds the instructions from the **latest version** every turn: the browser
never sends the document text or the system prompt, and anything it sends as `system` or `tools`
is ignored. A "Selected section" chip travels as `selection: { sectionId }` and the server reads
that section itself. Rate limit: 20 turns a minute per user. Each turn records `assistant.turn`
(model, token counts).

Tools (schemas in `packages/core/src/generation/schemas.ts`):

| Tool | Runs | Effect |
|---|---|---|
| `ask_questions` | Browser (human in the loop) | Up to 3 questions, each about one blank, with up to 4 generic options. The card saves the answers (`POST …/variables`, source `answer`; skipped = blank marked `skipped`), then returns them as the tool result and the assistant continues |
| `propose_section_edit` | Server | Proposes replacing or deleting one section (see **Proposals**). Nothing changes until the person accepts |
| `propose_sections` | Server | Proposes new sections after a given one (or at the start) |
| `define_signers` | Server | Proposes the signers (see **Signers**): every role and its fields. Contacts only if the person stated them |
| `set_variables` | Server | Fills blanks with values the person typed in the chat. Each value must appear, word for word (case, spacing and edge punctuation aside), in something the person said or answered (`isValueAttested`); otherwise nothing changes, `variables.rejected` is recorded and the model is told to ask instead |

### Clarifying questions

Enforced, not just prompted: a batch has at most three questions (schema), answers go straight
into the blank they're about, skipped blanks stay visibly unresolved, and finalising refuses while
any blank the text uses is empty. The prompt adds: never invent names, amounts, dates, durations,
legal terms or jurisdictions; ask with the tool, never in prose; options only for generic choices,
never a person's details.

## Signers (ADR 0045)

Who signs and where is one definition (`SignersDefinition`, `packages/core/src/generation/signers.ts`):
the roles (label, signer or gets a copy, contact, initials on every page) and each role's fields
(`SIGNATURE`, `INITIALS`, `NAME`, `DATE_SIGNED`, `TEXT`, `CHECKBOX`; a label says what to fill in or
what's being agreed to; required or not). `applySigners` turns it into roles plus signature blocks
in the text:

- a role's first signature block gets the new fields (its caption and existing field ids are kept;
  extra blocks for the same role are merged into it);
- a new role with fields gets a "For <role>" block in the section holding the other blocks, or a
  new "Signatures" section at the end;
- a removed role, or one left without fields, loses its blocks; a viewer can't have fields
  (`SignersError`, 400).

The Signers tab edits the definition (add or remove signers, signer or copy, contacts, initials on
every page, fields) and saves it with `PUT /api/generated-documents/:id/signers` (a version, event
`roles.updated`). The assistant proposes one with `define_signers`; it goes through the proposal
flow, is out of date if the signers changed since, and may only include names or emails the person
said (otherwise contacts are kept or left empty). Signer contacts never go in the body text.

**Initials on every page:** for each signer with the option on, the renderer puts an initials box
in the bottom margin of every page (right-aligned in role order; the page number moves left), with
ids `<role>_initials_p<n>`, so they reach the envelope like any other field. At most five signers
(`MAX_PAGE_INITIALS`, a preflight issue). A checkbox renders as a square with its statement beside
it; a text field as a labelled line.

## Proposals (ADR 0044)

The assistant never edits the text itself. `propose_section_edit` (replace or delete a section) and
`propose_sections` (insert sections) store a `GeneratedDocumentProposal` for the person, who accepts
or rejects it from a card in the chat (`packages/core/src/generation/proposals.ts`).

- **Format:** the assistant writes sections as paragraphs and lists of plain text, where `{{key}}` is
  a blank, `**x**` bold and `*x*` italic (`draftSection`). New blanks are declared with the proposal
  (`newBlanks`) and start unresolved.
- **Refused before the person sees it** (`buildProposal`; the reason goes back to the model and
  `proposal.refused` is recorded): an unknown section or blank, a new blank whose key exists, a
  section holding signature blocks (signers are set elsewhere), and **specifics the person never
  stated**: emails, phone numbers, amounts, dates, percentages and numeric durations
  (`unattestedSpecifics`, the same evidence as `set_variables`). Names and jurisdictions can't be
  recognised by pattern; the instructions and the person's review cover those.
- **Accept** (`POST …/proposals/:pid/accept`): applies the change to the latest version as a new
  version (actor AI, `proposal.accepted`), claiming the proposal in the same transaction, so it
  applies once. If the section it changes was edited since the proposal was made, or a new blank's
  key now exists, it's **out of date** (`STALE`, 409 `stale_proposal`); changes to blanks or other
  sections don't count. **Reject** (`…/reject`) records `proposal.rejected`.
- The detail returns the last 30 proposals with before and after text (blanks by label), pending
  ones reported `STALE` as soon as their section moves on. The prompt lists the last 10 with their
  outcome, so the assistant doesn't repeat a rejected change.
- Web: the card shows the reason, a word diff (`diffWords`: removed struck through, added
  highlighted), the status and Accept / Reject; a pending suggestion puts a "Suggested edit" badge
  on its section in the editor, and an accepted one updates the editor.

## Editing (ADR 0043)

The Editing tab is a TipTap editor whose schema is the document model
(`components/app/generator/editor/extensions.ts`): sections (an editable title, a number from a
CSS counter, Discuss), paragraphs, one-level lists, tables, and atomic nodes for blanks and
signature blocks. Headings, quotes, code, links and hard breaks are switched off, so pasted
content is reduced to what the model and the renderer support. `lib/generator-editor.ts` converts
both ways (a signature block's caption and fields ride in an `items` attribute in the editor) and
validates with `DocContentSchema` before anything is saved.

- **Saving:** debounced (1.2 s) and serialised (`useAutosave`, the field editor's hook);
  `PUT /api/generated-documents/:id/content { baseVersionId, content, newVariables }` appends a
  version. Blanks and signers live outside the text, so an edit based on an older version still
  applies when only they changed since (an answer given while typing); if the text itself changed,
  it's a 409 and the editor offers to load the latest version.
- **Blanks:** "Insert a blank" picks one of the document's blanks or names a new one (key from the
  label, `blankKey`); new blanks are declared in the same save and start unresolved. Clicking a
  blank fills it, as before.
- **Signature blocks** can be moved or deleted, not edited inside; signers and fields are set in
  the Signers tab (below).
- Read-only for people who can't edit and once finalised.

## Finalise

`POST /api/generated-documents/:id/finalize { versionId, acknowledged: true }`:

1. `versionId` must be the latest version (409 otherwise: the person reviews what gets sent).
2. `generationPreflight` returns every problem (400 `preflight_failed` with `issues[]`): empty
   blanks, no signer, a signer without a signature field, a missing name, an invalid or duplicate
   email (case-insensitive).
3. Render (below), store `original.pdf` (the `Document` is created UPLOADING first, like an upload,
   so the sweep removes a half-stored one), inspect and hash it, mark it READY and lock the
   generated document (`FINALIZED`), all under a row lock so no version can land after the one
   rendered. A thumbnail is queued as for any upload.
4. `createEnvelopeFromDocument` creates the DRAFT envelope (audit `envelope.created`): roles become
   recipients in order, rendered fields become `Field`s.
5. `document.finalized` is recorded. The web opens the envelope's draft editor.

Resumable: if step 4 fails, calling again re-renders the same version (deterministic, so the fields
match the stored PDF) and creates only the envelope. A finalised document is locked; its PDF is a
first-class document (files list, templates, other envelopes).

## Rendering (`packages/pdf/src/compose/document.ts`, ADR 0042)

`composeGeneratedDocument(data, { date, allowUnresolved })` lays the tree out with pdf-lib and the
bundled Noto Sans (regular, bold, italic, bold italic): A4 or Letter, 72 pt margins, title,
numbered headings kept with their next lines, greedy line breaking (long words break between
characters), lettered lists, tables (equal columns, bordered cells, bold header cells, rows never
split across pages), signature blocks never split across pages, "Page X of Y". Text goes through `sanitizeForFont` (Latin, Greek, Cyrillic;
ADR 0009).

- **Fields:** each field is a fixed-size box (`FIELD_SIZES`, e.g. signature 180 × 40 pt) drawn as a
  signing line along its bottom edge, its label underneath, outside the box, so a stamped signature
  never covers it. The result lists every field's page and rect in PDF points;
  `envelopeDraftFromGenerated` converts them with `fromPdfRect` (docs/coordinates.md).
- **Deterministic:** the same version gives the same bytes: fixed fonts and metadata, the version's
  creation time as the PDF dates, fonts embedded in a fixed order (pdf-lib names subsets from a
  seeded generator, so the order matters). Tested by hashing two renders.
- **Preview:** `GET …/preview` renders the latest version with blanks highlighted as `[Label]`. Not
  stored. A final render refuses empty blanks.
- **Checked:** coordinate snapshots, and a PDFium pass that finds each field's drawn line and label
  where the layout says they are (`compose.test.ts`).

## Web (`/generate`, `components/app/generator/`)

- `/generate`: starters and your drafts; the switch for owners and admins while it's off. "Draft
  with AI" on All files links here.
- `/generate/:id`: a full page (`isFullPage`) with its own bar (back, title, version, Finalise or
  Open envelope). Assistant on the left, document on the right; on phones one pane at a time, both
  mounted.
- **Chat:** assistant-ui primitives (`useChatRuntime` + `AssistantChatTransport`), styled with Arc.
  The toolkit (`defineToolkit`, `Tools`) renders `ask_questions` as the question card and
  `set_variables` as a one-line note. The question card has its own answer field; while it waits,
  the chat input is closed, so a reply can't be mistaken for an answer. Answered cards collapse to
  "question → answer or Skipped".
- **Editing** tab: the editor above, with its toolbar (coss `Toolbar`: bold, italic, underline,
  lists, table, insert blank, add section) and a Saved / Saving… / Retry status. Sections have a
  Discuss button that attaches the section to the next message (one message, then it clears).
  Blanks are chips: dashed and highlighted while empty ("skipped" when skipped), the value once
  filled; click to fill.
- **Signers** tab: a `Panel` per role (role, signer or copy, name, email, initials on every page,
  the role's fields with "Add field"), "Add signer", "Save signers"; the preflight's problems show on
  the fields. A suggested set of signers shows as a line-by-line diff in its card.
- **Preview** tab: the rendered PDF.
- Finalise: an Arc dialog with the required "I've read the whole document" confirmation.

## Data handling

Document text, blanks and the conversation are sent to the configured model provider, which is
why workspaces opt in. Signer emails are not in the prompt (only whether a contact is set). Logs
and events never hold prompts or model output. Generated documents, versions, events and the
conversation are workspace data: deleting the workspace deletes them.
