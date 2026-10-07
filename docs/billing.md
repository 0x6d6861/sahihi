# Billing: plans and quotas

Every workspace is on a **plan** that limits **envelopes sent per month** and **seats**. There's
no payment provider yet: the Sahihi team sets plans (ADR 0014).

## Plans (`packages/core/src/workspace/billing.ts`)

| Plan | Envelopes / month | Seats |
|---|---|---|
| Free (default) | 5 | 2 |
| Starter | 50 | 5 |
| Business | 300 | 20 |
| Enterprise | unlimited | unlimited |

A workspace's plan is in `Subscription.plan` (a `PlanId` string). No row means Free, and an
unknown value also falls back to Free (`planFor`), never to unlimited. `provider*` columns are
reserved for a future payment provider.

Change a plan:

```bash
bun run billing:set-plan <organization-slug> <free|starter|business|enterprise>
```

## Envelopes per month

- **Period:** the calendar month in **Africa/Nairobi** (`billingPeriod`, EAT = UTC+3). It resets at
  00:00 on the 1st, Nairobi time.
- **Usage is derived, not counted:** envelopes of the workspace with `sentAt` in the period
  (`countEnvelopesSent`). A voided envelope still counts, because it was sent. Drafts, templates,
  reminders and signing don't count.
- **Enforcement:** `POST /envelopes/:id/send` calls `assertEnvelopeQuota(tx, orgId)` first inside
  the send transaction. It takes a per-workspace advisory lock, so two concurrent sends can't both
  get the last envelope. At the limit it returns **402**:
  ```json
  { "error": "quota_exceeded", "message": "…", "plan": "free", "limit": 5, "used": 5,
    "resetsAt": "2026-09-30T21:00:00.000Z" }
  ```
  Nothing is changed, and the envelope stays a draft.

## Seats

Seats = members + pending, unexpired invitations (`countSeats`, `canAddSeat`). better-auth enforces
them:
- `membershipLimit` (`auth.ts`) returns the plan's seats. It's checked when a member is added or
  an invitation is accepted.
- `organizationHooks.beforeCreateInvitation` refuses a new invitation when every seat is taken. A
  pending invitation holds a seat. Resending an existing invitation isn't blocked.

Downgrades don't remove anyone: an over-limit workspace just can't add more people.

## API

`GET /api/billing` (any member of the workspace): `{ plan, period, envelopes: { used, limit, level },
seats: { members, pendingInvitations, used, limit, level }, plans }`. `level` is `ok`, `warning`
(≥ 80 %) or `exceeded` (`usageLevel`).

## Web

- **Settings → Plan & usage** (`/settings/billing`): current plan, usage meters (red at the limit,
  amber from 80 %), seats breakdown, and the plan table.
- **Envelopes** list: a warning or error banner from `quotaBanner` near and at the limit.
- **Send:** a 402 shows in the "Before you can send" alert, which stays on screen.

## Tests

`createSender()` puts test workspaces on **Enterprise**, so quotas never interfere with other
suites. `billing.itest.ts` passes `{ plan: "free" }` and covers the limit, concurrent sends, the
period boundary, upgrades, seats and read access.

## Next

A payment provider (Paystack covers cards and M-Pesa for Kenya) behind a small interface that sets
`Subscription.plan` from its webhooks, plus self-serve upgrades on the Plan & usage page.
