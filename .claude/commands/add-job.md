---
description: Add a BullMQ job (producer + consumer + tests)
argument-hint: "<job purpose>"
---
Job: $ARGUMENTS

1. Add the payload type to the right map in `packages/infra/src/queues.ts` (IDs only, never PII or
   file bytes).
2. Handle it in `apps/worker/src/jobs/*` and register it in `apps/worker/src/index.ts`. It must be
   **idempotent**: re-read state and skip work that's already done. For schedules, use
   `upsertJobScheduler` with `tz: "Africa/Nairobi"`.
3. Enqueue from the API **after** the transaction commits. Use a deterministic `jobId` when duplicates
   must collapse.
4. Put pure decision logic in `packages/core` with tests. Update the queue table in
   `docs/architecture.md`. Run `/check`.
