import { getEnv, QUEUES } from "@sahihi/config"
import { webhookRetryDelayMs } from "@sahihi/core"
import { processBulkSend } from "@sahihi/envelopes"
import {
  captureError,
  createLogger,
  type FinalizeJobs,
  flushErrors,
  getQueues,
  initErrorTracking,
  type MaintenanceJobs,
  type NotificationJobs,
  redis,
  type WebhookJobs,
} from "@sahihi/infra"
import { type Job, Worker } from "bullmq"
import { finalizeEnvelope } from "./jobs/finalize"
import { expireEnvelopes, remindRecipients, sweepAbandonedUploads } from "./jobs/maintenance"
import { handleNotification } from "./jobs/notifications"
import {
  buildExport,
  cleanupExports,
  purgeEnvelope,
  purgeOrganizationStorage,
  retentionSweep,
} from "./jobs/retention"
import { deliverWebhook, sweepWebhookOutbox } from "./jobs/webhooks"

getEnv() // fail fast on bad config
const log = createLogger("worker")
const tracking = initErrorTracking("worker")
const connection = redis()

const workers = [
  new Worker<NotificationJobs[keyof NotificationJobs]>(
    QUEUES.notifications,
    (job) => handleNotification(job as Parameters<typeof handleNotification>[0]),
    { connection, concurrency: 10 },
  ),
  new Worker<FinalizeJobs["envelope.finalize"]>(
    QUEUES.finalize,
    (job: Job<FinalizeJobs["envelope.finalize"]>) => finalizeEnvelope(job.data.envelopeId),
    { connection, concurrency: 2 },
  ),
  new Worker<MaintenanceJobs[keyof MaintenanceJobs]>(
    QUEUES.maintenance,
    async (job) => {
      if (job.name === "envelopes.expire") return expireEnvelopes()
      if (job.name === "envelopes.remind") return remindRecipients()
      if (job.name === "documents.sweep-uploads") return sweepAbandonedUploads()
      if (job.name === "webhooks.sweep") return sweepWebhookOutbox()
      if (job.name === "retention.sweep") return retentionSweep()
      if (job.name === "exports.cleanup") return cleanupExports()
      if (job.name === "envelope.purge") {
        const data = job.data as MaintenanceJobs["envelope.purge"]
        return purgeEnvelope(data.envelopeId, data.reason)
      }
      if (job.name === "export.build") {
        return buildExport((job.data as MaintenanceJobs["export.build"]).exportId)
      }
      if (job.name === "bulk.send") {
        return processBulkSend((job.data as MaintenanceJobs["bulk.send"]).bulkSendId)
      }
      if (job.name === "organization.purge-storage") {
        const data = job.data as MaintenanceJobs["organization.purge-storage"]
        return purgeOrganizationStorage(data.organizationId)
      }
      throw new Error(`Unknown maintenance job ${job.name}`)
    },
    { connection, concurrency: 1 },
  ),
  new Worker<WebhookJobs["webhook.deliver"]>(
    QUEUES.webhooks,
    (job: Job<WebhookJobs["webhook.deliver"]>) =>
      deliverWebhook(job.data.deliveryId, {
        isFinal: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      }),
    {
      connection,
      concurrency: 10,
      settings: { backoffStrategy: (attemptsMade: number) => webhookRetryDelayMs(attemptsMade) },
    },
  ),
]

// Job lifecycle (docs/observability.md): ids and timings only, never job data (it can carry raw
// tokens and OTP codes). Error tracking hears about the final failure, not every retry.
for (const w of workers) {
  w.on("failed", (job, err) => {
    const final = !job || job.attemptsMade >= (job.opts.attempts ?? 1)
    const fields = {
      queue: w.name,
      job: job?.name,
      jobId: job?.id,
      attempt: job?.attemptsMade,
      final,
      err,
    }
    if (final) {
      log.error("job failed", fields)
      captureError(err, { queue: w.name, job: job?.name, jobId: job?.id })
    } else log.warn("job attempt failed; retrying", fields)
  })
  w.on("completed", (job) =>
    log.info("job done", {
      queue: w.name,
      job: job.name,
      jobId: job.id,
      ms: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
    }),
  )
}

// Repeatable schedules (idempotent — same key replaces the previous schedule)
const { maintenance } = getQueues()
await maintenance.raw.upsertJobScheduler(
  "expire-hourly",
  { pattern: "5 * * * *" },
  { name: "envelopes.expire", data: {} },
)
await maintenance.raw.upsertJobScheduler(
  "sweep-uploads-15m",
  { pattern: "*/15 * * * *", tz: "Africa/Nairobi" },
  { name: "documents.sweep-uploads", data: {} },
)
await maintenance.raw.upsertJobScheduler(
  "webhooks-sweep-5m",
  { pattern: "*/5 * * * *" },
  { name: "webhooks.sweep", data: {} },
)
await maintenance.raw.upsertJobScheduler(
  "retention-daily",
  { pattern: "30 2 * * *", tz: "Africa/Nairobi" },
  { name: "retention.sweep", data: {} },
)
await maintenance.raw.upsertJobScheduler(
  "exports-cleanup-daily",
  { pattern: "45 2 * * *", tz: "Africa/Nairobi" },
  { name: "exports.cleanup", data: {} },
)
await maintenance.raw.upsertJobScheduler(
  "remind-daily",
  { pattern: "0 9 * * *", tz: "Africa/Nairobi" },
  { name: "envelopes.remind", data: {} },
)

log.info(`worker running: ${workers.map((w) => w.name).join(", ")}`, {
  errorTracking: tracking ? "sentry" : "off",
})

async function shutdown() {
  log.info("worker shutting down")
  await Promise.all(workers.map((w) => w.close()))
  await flushErrors()
  process.exit(0)
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
