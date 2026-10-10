# 0045: Signers as one definition

- **Status:** accepted
- **Date:** 2026-10-09

## Context
Generated documents had fixed signer roles from the starter, and fields only in the starter's
signature blocks. People need to add a witness, send a copy to legal, ask for initials on every
page or a "terms accepted" checkbox, and the assistant should be able to suggest all of that, while
signer identity stays data and never prose.

## Decision
- **One definition** (`SignersDefinition`): roles with contacts and an initials-on-every-page
  option, plus each role's fields. `applySigners` is the only code that turns it into roles and
  signature blocks; the Signers tab (`PUT …/signers`, replacing `PUT …/roles`) and the assistant use
  it alike.
- **One assistant tool.** `define_signers` replaces both `define_signers` and
  `place_signature_field` from the plan: defining who signs and where they sign are one decision,
  and a single proposal shows it as one diff. It goes through the proposal flow (ADR 0044); names
  and emails must be something the person said.
- **Blocks follow roles.** A role's first block keeps its caption and field ids; new roles get a
  plain "For <role>" block in the signatures section. Placing fields at arbitrary spots in the text
  isn't offered: signature blocks are where people expect them, and the editor can move a block.
- **Initials on every page are rendered, not stored.** The renderer adds one initials box per page
  per signer in the bottom margin, with stable ids, so they map onto envelope fields with the rest.
  Five signers at most (they share one margin row).

## Consequences
- Removing a role removes its blocks but not wording that mentions the party; the person edits the
  text if needed.
- Field ids for new fields are generated on save, so a definition only gains ids after a round trip;
  the Signers tab reloads from the server after saving.
- The envelope editor still allows moving fields after finalising (a later item).
