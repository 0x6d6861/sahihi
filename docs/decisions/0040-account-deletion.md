# 0040: Deleting an account erases the person and keeps the work

- **Status:** accepted
- **Date:** 2026-10-09

## Context
People need to delete their own account (Kenya DPA / GDPR erasure). better-auth's
`user.deleteUser` removes the `User` row, but documents, envelopes, templates, folders, exports,
API keys and bulk sends point at their creator with a required foreign key: deleting the row fails
for anyone who has created anything. Reassigning that work to another member would put the wrong
person on certificates of envelopes still in flight (`finalize` reads the sender's name and
email). The audit trail stores only `actorUserId` (no foreign key), so it isn't in the way.

## Decision
- **Erase, don't delete the row.** Our own flow, not `user.deleteUser`. `eraseUser` (one
  transaction) deletes sessions, the password account, 2FA, passkeys, memberships, pending
  deletion links, picture and saved-signature rows, notifications and preferences; revokes the
  user's API keys; and sets name "Deleted user" and email `deleted-<id>@redacted.invalid` (the
  pattern used for redacted recipients). The worker's `user.purge-storage` deletes `user/<id>/`.
- **Work stays with the workspace**, credited to "Deleted user". Certificates already issued keep
  the original name; envelopes in flight finalize with "Deleted user" as sender.
- **Two steps.** The password (rate-limited per user, since `auth.api` calls skip better-auth's
  limits), then a 1-hour emailed link, so a hijacked session alone can't delete the account. The
  link's token is stored only as a hash. The confirm route is public (any device) and rate-limited.
- **Last owners must hand on first.** Deletion is refused while the user is the only owner of a
  workspace (`deletionBlockers`, same rule as leaving), checked at both steps. The final check runs
  inside `eraseUser`'s transaction after locking the member rows of the user's workspaces, so two
  co-owners deleting at once can't both pass it.
- **Nothing keeps the old address.** Invitations to it are deleted, and so is every pending link
  for the user (a password reset would otherwise give the erased row a password).

## Consequences
- `User` rows outlive their people. Anything listing users should treat a placeholder email as a
  deleted account (they have no memberships, so workspace lists don't show them).
- The same email can sign up again later as a new, unrelated account.
- If a later change adds a personal table keyed by `userId`, `eraseUser` must clear it too.
- better-auth's own "leave" and "remove member" don't take our lock: a co-owner leaving at the
  exact moment the other confirms deletion can still leave a workspace without an owner.
- If queuing `user.purge-storage` fails after the erase, the error is logged and the files under
  `user/<id>/` stay until the job is queued again by hand.
