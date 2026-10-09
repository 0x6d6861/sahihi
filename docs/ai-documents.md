# AI-generated documents

Members draft a document with an AI assistant, fill in every blank, name the signers, then
**finalise**. Finalising renders a PDF, stores it as an ordinary READY `Document` and creates a DRAFT
envelope with the signers as recipients and their fields already placed. From there the existing
flow takes over (Review & send → sign → certificate). See ADR 0042.

What ships today (roadmap P6, first slice): one starter (Mutual NDA), the assistant's questions and
blank filling, direct blank editing, signer contacts, a PDF preview, finalise. Not yet: editing the
wording (rich-text editor, assistant edit proposals), the assistant defining signers or placing
fields, more starters, saving a generated document as a template.

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
| `paragraph`, `bulletList`, `orderedList` | Text. Inline nodes are `text` (bold, underline) and `variable` |
| `variable` node | An atomic blank pointing at `variables[key]`. The value never sits in the text |
| `signatureBlock` | Where one signer role signs: caption paragraphs and `field` nodes (`SIGNATURE`, `INITIALS`, `NAME`, `DATE_SIGNED`, `TEXT`, `CHECKBOX`) |
| `variables[]` | `key`, `label`, `type`, `hint`, `value` (null until filled), `status` (`unresolved`, `answered`, `skipped`), `source` (`answer`, `chat`, `edit`) |
| `roles[]` | Signer roles: `key`, `label`, `SIGNER` or `VIEWER`, and the contact (`name`, `email`) |

Signer identity is data: emails exist only in `roles`, and party names in the body are blanks, so
the text and the signer list can't disagree. `structureIssues` checks the references the schema
can't (unknown blank or role, duplicate ids, a viewer with fields).

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
| `set_variables` | Server | Fills blanks with values the person typed in the chat. Each value must appear, word for word (case, spacing and edge punctuation aside), in something the person said or answered (`isValueAttested`); otherwise nothing changes, `variables.rejected` is recorded and the model is told to ask instead |

### Clarifying questions

Enforced, not just prompted: a batch has at most three questions (schema), answers go straight
into the blank they're about, skipped blanks stay visibly unresolved, and finalising refuses while
any blank the text uses is empty. The prompt adds: never invent names, amounts, dates, durations,
legal terms or jurisdictions; ask with the tool, never in prose; options only for generic choices,
never a person's details.

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
bundled Noto Sans: A4 or Letter, 72 pt margins, title, numbered headings kept with their next lines,
greedy line breaking (long words break between characters), lettered lists, signature blocks never
split across pages, "Page X of Y". Text goes through `sanitizeForFont` (Latin, Greek, Cyrillic;
ADR 0009).

- **Fields:** each field is a fixed-size box (`FIELD_SIZES`, e.g. signature 180 × 40 pt) drawn as a
  signing line along its bottom edge, its label underneath, outside the box, so a stamped signature
  never covers it. The result lists every field's page and rect in PDF points;
  `envelopeDraftFromGenerated` converts them with `fromPdfRect` (docs/coordinates.md).
- **Deterministic:** the same version gives the same bytes: fixed fonts and metadata, the version's
  creation time as the PDF dates, no randomness. Tested by hashing two renders.
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
- **Document** tab: sections with their numbers and a Discuss button that attaches the section to
  the next message (one message, then it clears). Blanks are chips: dashed and highlighted while
  empty ("skipped" when skipped), the value once filled; click to fill.
- **Signers** tab: name and email per role, with the preflight's problems on the fields.
- **Preview** tab: the rendered PDF.
- Finalise: an Arc dialog with the required "I've read the whole document" confirmation.

## Data handling

Document text, blanks and the conversation are sent to the configured model provider, which is
why workspaces opt in. Signer emails are not in the prompt (only whether a contact is set). Logs
and events never hold prompts or model output. Generated documents, versions, events and the
conversation are workspace data: deleting the workspace deletes them.
