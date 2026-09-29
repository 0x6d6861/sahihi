# Templates

A template is a **document + recipient roles + a field layout**, saved from an envelope and used to
start new envelopes without placing fields again (ADR 0012).

## Model (`schema.prisma`)

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
| `POST /api/templates/:id/envelopes` | Use it: `{ title, message?, expiresAt?, recipients: [{ roleId, name, email, phone? }] }` → **DRAFT** envelope (201) |

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
  a phone input for SMS roles), message → the new draft's envelope page.

## Not in v1

- Editing a template's layout directly. Create an envelope from it, adjust, and save it as a new
  template.
- Applying a layout to a different document.
- Envelope expiry from the template form. Set it on the draft instead.
