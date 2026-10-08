# Templates

A template is a **document + recipient roles + a field layout**, saved from an envelope and used to
start new envelopes without placing fields again (ADR 0012).

## Model (`schema.prisma`)

Since ADR 0037 a template keeps several documents (`TemplateDocument`, in order). Its fields point
at one of them (`TemplateField.templateDocumentId`). Its supporting files are its own copies
(`TemplateAttachment`, under `org/{org}/templates/{id}/attachments/`). Saving copies them from the
envelope; using the template copies them again into the new envelope. Deleting the template
deletes its copies. A document can't be deleted while a template uses it.


| Model | What |
|---|---|
| `Template` | org, `documentId`, name, description, default `message`, `signingOrder`, creator |
| `TemplateRole` | a recipient slot: `label` ("Tenant"), `role`, `order`, `verification`, `colorIndex`, and an optional **fixed contact** (`name`, `email`, `phone`) for someone who signs every time |
| `TemplateField` | like `Field`, owned by a role instead of a recipient (normalized coordinates, `docs/coordinates.md`) |

A template always carries its document, because fields are placed on that PDF's pages.
`DELETE /documents/:id` returns **409** while any template uses the document. Deleting a template
removes its roles and fields and never touches envelopes created from it. Deleting the
organization removes its templates.

## API (`apps/api/src/routes/templates.ts`, behind `requireOrg`)

| Route | |
|---|---|
| `POST /api/templates` | Save an envelope (any status) as a template: `{ envelopeId, name, description?, roles: [{ recipientId, label, keepContact }] }`. Every recipient must get a role (`templateRolesFromEnvelope`). The envelope isn't changed. |
| `GET /api/templates` | Org's templates, newest first, with `permissions.manage` per row |
| `GET /api/templates/:id` | Roles and fields, plus `permissions.manage` |
| `PATCH /api/templates/:id` | Rename / describe (`UpdateTemplateSchema`) |
| `DELETE /api/templates/:id` | 204 |
| `POST /api/templates/:id/envelopes` | Use it: `{ title, message?, expiresAt?, recipients: [{ roleId, name, email, phone? }], send? }` → **DRAFT** envelope (201). `send: true` also sends it and answers `{ envelope, sent }`; a refused send keeps the draft with `sent: false` and the reason (ADR 0018) |

**Using a template** (`draftFromTemplate`, `@sahihi/core`):
1. Each role gets a person: the input, or its fixed contact.
2. People are validated like any recipient list: `RecipientInputSchema`, unique emails, and a phone
   number for SMS verification.
3. Issues come back per role (`path: "recipients.<roleId>.<field>"`), so the form shows them next to
   the right input.
4. Recipients keep the role's step for `SEQUENTIAL` templates, and everyone is on step 1 for
   `PARALLEL` ones. Viewer roles never get fields.
5. The envelope is created in one transaction with its recipients and fields, and audited as
   `envelope.created` with `data.templateId`. The draft then goes through the normal editor and
   preflight before Send.

**Permissions** (`docs/auth.md` → Roles): everyone in the org sees and uses templates. Rename and
delete need the creator, or `template:manage-any` (admin, owner). Other orgs get 404
(`tenant-isolation.itest.ts`).

## Web

- **Templates** (`/templates`, sidebar): table with roles, document and author; **Use**; rename and
  delete for managers.
- **Save as template**: a dialog in the envelope header, available to anyone who can see the
  envelope. It proposes role labels (`defaultRoleLabels`: "Signer 1", "Viewer 1"…), and each role
  has "Always send to <email>" to keep the contact. On a draft, pending field edits are saved first
  (`DraftState.settle`, like Send).
- **Use template** (`/templates/[id]/use`): title, one block per role (fixed contacts shown locked,
  a phone input for SMS roles), message. **Create draft** → the new draft's envelope page;
  **Send now** creates and sends it in one call, then opens the envelope (if sending is refused,
  e.g. the plan limit, it opens as a draft with a toast saying why).

## Not in v1

- Editing a template's layout directly. Create an envelope from it, adjust, and save it as a new
  template.
- Applying a layout to a different document.
- Envelope expiry from the template form. Set it on the draft instead.
