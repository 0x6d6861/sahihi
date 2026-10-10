# 0048: Parties of a generated document, linked to signers through the text

- **Status:** accepted
- **Date:** 2026-10-10

## Context
A generated document names its parties in blanks ("First party's name", "Candidate's name"), and
its signers are roles with their own contacts (ADR 0045). Nothing tied the two together: the
Signers tab showed "First party" with an empty name after the person had answered "Acme Ltd", a
party the assistant added to the text got no signer, and the assistant couldn't tell which signer
stood for which party.

## Decision
- **A `party` flag on blanks.** A blank that names a party (a person or an organisation) is marked
  `party: true`: the starters mark theirs, and the assistant marks the ones it declares in
  `newBlanks`. Blanks a signature block's caption names also count, so documents from before the
  flag work unchanged.
- **The link to a signer is the caption, not a stored field.** A signer signs for the party its
  signature block names ("For {party_a_name}"); `rolePartyKeys` reads it. The text already says
  who signs for whom, so a separate field would be a second truth that could disagree with it.
- **`SignersDefinition.parties`** (role → party blank) carries the link through the Signers tab and
  `define_signers`. It is read from the captions; on save it only captions a new role's block
  ("For {party}"). Existing captions are the person's text and stay as written.
- **A party's filled value counts as said** for a signer's name in `define_signers`: the person
  answered it. The assistant is told to use it only for a person signing for themselves and to
  ask who signs for a company.
- **A party without a signer is a hint, not a finalise blocker.** A document can name a party who
  doesn't sign (a guarantor named for reference, say).

## Consequences
- The Signers tab says who each signer signs for, offers the party's name as the signer's name,
  and offers "Add signer for …" for parties nobody signs for.
- Editing a caption by hand changes the link; that is the intended behaviour.
- Blanks inserted in the editor aren't flagged; their party status comes from a caption, or the
  assistant flags them.
