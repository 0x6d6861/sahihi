# 0012: Templates carry their document; saved from envelopes

- **Status:** accepted
- **Date:** 2026-09-28

## Context
Senders reuse the same agreements (leases, NDAs, employment contracts) with different people.
Fields are normalized to a specific PDF's pages (`docs/coordinates.md`), so a field layout only means
something on the document it was placed on. Building a separate template editor would duplicate the
field and recipient editors.

## Decision
- A template is a document + roles + fields. It references its `Document` (originals are immutable),
  and deleting that document is refused while templates use it.
- Templates are saved **from an envelope** ("Save as template"), reusing the existing editors, and
  used to create a **DRAFT** envelope that then goes through the normal editor, preflight and Send.
- Roles can keep a fixed contact (e.g. the company's own countersigner). Everyone else is filled in
  when the template is used.
- Validation of the people is shared (`draftFromTemplate` in `@sahihi/core`) between the form and
  the API.
- Permissions follow envelopes: everyone uses templates; the creator or admin/owner rename or delete
  them (`template:manage-any`).

## Consequences
- No layout editing inside a template (v1). The workaround is use → adjust → save as new.
- A template pins a document version. A new version of an agreement means a new template.
- Envelopes created from a template are independent copies (`envelope.created` records
  `templateId`); deleting or renaming the template never affects them.
