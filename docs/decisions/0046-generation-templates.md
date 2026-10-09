# 0046: AI document templates, separate from envelope templates

- **Status:** accepted
- **Date:** 2026-10-09

## Context
People who draft the same document again and again (their own offer letter, their edited NDA) want
to start from their version, not the stock starter. Sahihi already has envelope templates (ADR
0012): a READY PDF with roles and fields placed on its pages.

## Decision
- **Own model.** `GenerationTemplate` stores `GeneratedDocumentData` (the tree, blanks, roles and
  fields), not a PDF. An envelope template can't hold blanks or editable text, and a generated
  document's PDF only exists once it's finalised, with every blank filled. Starting from a template
  copies the data into version 1 of a new document; the template is never referenced again for
  content, so templates need no versions and aren't edited in place.
- **Listed on Draft with AI only.** By the product owner's choice, templates appear on `/generate`
  next to the starters, not in All files or the envelope Templates list. That avoids a fourth item
  kind in the merged files list, which branches on every kind.
- **Clear by default, keep by choice.** Answers and contacts are cleared unless ticked in the save
  dialog, like `keepContact` on envelope templates. A kept answer is marked `source: "template"`
  and counts as filled. The event records which keys were kept, never the values.
- **Same permissions as envelope templates.** `template:create` to save (enforced here),
  `canManageTemplate` to delete; everyone in the workspace can use one.

## Consequences
- A template can be saved from a finalised document, so a sent agreement can seed the next one.
- Changing a template means starting from it, editing, and saving a new one.
- Templates aren't in data exports, like envelope templates; deleting the workspace deletes them.
