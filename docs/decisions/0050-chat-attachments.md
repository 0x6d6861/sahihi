# 0050: Files attached in the drafting chat

- **Status:** accepted
- **Date:** 2026-10-11

## Context
People drafting with the assistant often have the details in a file already: a term sheet, an
earlier contract, an invoice, a photo of an ID or a business registration. The assistant only
used what they typed (ADR 0042: never invent; `isValueAttested` checks every value against what
the person said), so they had to retype it.

## Decision
- **Documents count as the person's words.** A PDF, Word or text file attached in the chat is
  read on the server (`POST /generated-documents/:id/attachments`, the import readers of ADR
  0049) and goes with the message as its extracted text (a `text/plain` file part). The assistant
  sees it quoted as `<attached_file>`, and its text joins what the person said: the same
  word-for-word evidence check then lets the assistant fill blanks or propose wording from it.
  The person chose the file, so it's their statement, like a message they pasted.
- **Images are for reference only.** A photo or scan goes to the model as an image (the configured
  model must accept images). What the model reads from an image can't be checked word for word,
  so it isn't evidence: the assistant asks the person to confirm a value before using it.
- **Only text is kept.** The file itself is never stored. A document's text stays in the
  conversation (at most 20,000 characters per file, the conversation going into every turn), so
  it's covered by the drafts' retention, export and deletion. An image is replaced by a note when
  the conversation is saved: it's sent while the page is open and gone after a reload.
- **Limits:** three files per message; documents up to 10 MB, images up to 5 MB (PNG, JPEG, WebP,
  GIF). The server checks every file part of every turn (data URLs only, allowed types and sizes,
  only on the person's messages), since the browser sends the conversation.
- **Request size:** the API caps bodies at 8 MB, too little for a turn with images in base64. The
  attachments route takes the import limit (10 MB + the multipart envelope, 413 `too_large`), and
  the chat route three 5 MB images in base64 plus 4 MB of conversation. To keep turns small, the
  browser scales photos down to 2048 px (JPEG) before attaching them, and sends an image only with
  the message it's attached to: earlier ones go as the same note the server saves.
- **Trail:** `attachment.read` records the kind and length of a document read, never its name or
  text.

## Consequences
- A scanned PDF has no text: the dialog says so, and the person can attach a photo of the page
  instead, which is reference only.
- Forging an attachment in the request gains nothing: it carries no more weight than the person
  typing the same words.
- A model without image input fails the turn that carries an image; the reply shows the error and
  "Try again".
