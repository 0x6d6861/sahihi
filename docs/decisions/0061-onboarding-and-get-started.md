# 0061: Multi-step onboarding and the Get started checklist

- **Status:** accepted
- **Date:** 2026-10-15

## Context
Onboarding was one field ("Name your workspace") and then an empty All files page. New owners had
to find Members, the logo and the AI switch on their own, and nothing told them what a first
envelope takes. The redesign (`design/app/app.pen`, section 02) adds steps and a checklist.

## Decision
- **Steps** in `app/(onboarding)/onboarding/page.tsx`, in their own route group so each step can
  show its own preview beside the form (`AuthShell` + `aside`): Workspace (name and an optional
  logo, uploaded once the workspace exists), Team (`InviteRows`: several invitations at once, capped
  at the plan's free seats from `GET /api/billing`), AI assistant (only when
  `GET /api/generated-documents/settings` says `configured` and `canManage`). Only the first step
  is required; the rest have "Skip for now" or "Not now".
- **Get started** on All files (`components/app/files/getting-started.tsx`): five steps worked out
  from what exists, so it never drifts (`gettingStarted()` in `@sahihi/core`): workspace, team
  (another member or a pending invitation), upload, send (an envelope left DRAFT), draft (an AI
  draft exists). `GET /api/getting-started` returns the steps, the workspace name and whether the
  caller may invite. It shows at the top level of All files, not while filtering, and hides itself
  once every step is done.
- **Hide** is per member and workspace: a new `MemberPreference` row
  (`gettingStartedDismissedAt`), written by `PUT /api/getting-started { dismissed }`. It's a
  separate model from `NotificationPreference` so notification settings keep one meaning.

## Consequences
- One more table and two routes; both routes take no ids and read only the caller's workspace and
  their own row (classified in `tenant-isolation.itest.ts`).
- The e2e journeys go through the new steps (`apps/e2e/tests/onboarding.ts`).
- Someone who arrives from a signing link can leave onboarding without a workspace (ADR 0062).
