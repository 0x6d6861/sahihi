# 0014: Plans and quotas first, payment provider later

- **Status:** accepted
- **Date:** 2026-09-29

## Context
Workspaces need limits (envelopes, seats) before we pick and integrate a payment provider. Paystack,
Stripe and M-Pesa (Daraja) each shape the integration differently, and none is needed to enforce
limits.

## Decision
- Plans are a static catalogue in `@sahihi/core`. The workspace's plan is `Subscription.plan`
  (string, default Free; unknown values → Free). The Sahihi team sets it with
  `bun run billing:set-plan`.
- Envelope usage is **derived** from `Envelope.sentAt` within a Nairobi calendar month, not a
  counter, so there's nothing to drift or reset. Send checks the quota under a per-workspace
  advisory lock and returns **402** when it's used up (decided with the product owner: block, don't
  warn).
- Seats use better-auth's `membershipLimit` and `beforeCreateInvitation`. Pending invitations hold
  a seat.

## Consequences
- The quota check adds a count query to every send. It's indexed by `organizationId` and bounded
  by the period.
- Voided envelopes still count, since they were sent.
- A provider can be added later without schema churn: it writes `Subscription.plan` (and the
  reserved `provider*` columns) from its webhooks.
- Changing a plan's limits is a code change and a deploy (the catalogue lives in core).
