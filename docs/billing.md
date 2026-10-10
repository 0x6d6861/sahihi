# Billing: plans and quotas

Every workspace is on a **plan** that limits **envelopes sent per month**, **seats** and **AI
assistant replies per month**. There's
no payment provider yet: the Sahihi team sets plans (ADR 0014).

## Plans (`packages/core/src/workspace/billing.ts`)

| Plan | Envelopes / month | Seats | AI replies / month |
|---|---|---|---|
| Free (default) | 5 | 2 | 30 |
| Starter | 50 | 5 | 300 |
| Business | 300 | 20 | 1,500 |
| Enterprise | unlimited | unlimited | unlimited |

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

## AI assistant replies per month

- **Usage is derived:** the workspace's `assistant.turn` events in the period
  (`countAssistantTurns`), one per reply of the assistant in Drafting (docs/ai-documents.md),
  including the replies that continue on their own after a question card is answered. Editing,
  filling in blanks, signers and finalising don't count.
- **Enforcement:** `POST /generated-documents/:id/chat` checks `checkAssistantQuota` before calling
  the model. At the limit it returns **402** `assistant_quota_exceeded` (`message`, `plan`, `limit`,
  `used`, `resetsAt`), and the chat shows the message in place of the reply. A turn is recorded
  when it ends, so replies already streaming can take the count a few over; the per-user rate limit
  (20 a minute) bounds that. No lock: the cost of a few extra replies is lower than serialising
  every chat request.
- Same period as envelopes (calendar month, Nairobi).

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
seats: { members, pendingInvitations, used, limit, level }, assistant: { used, limit, level },
plans }`. `level` is `ok`, `warning`
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
