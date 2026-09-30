import { getEnv, QUEUES } from "@sahihi/config"
import { WEBHOOK_MAX_ATTEMPTS } from "@sahihi/core"
import { type JobsOptions, Queue } from "bullmq"
import { Redis } from "ioredis"

/**
 * Typed job contracts shared by producers (api) and consumers (worker).
 * Add a job: extend the map below, then handle it in apps/worker/src/index.ts.
 * Payloads carry IDs only — workers re-read state from the DB.
 */
export interface NotificationJobs {
  "auth.verify-email": { email: string; name: string; url: string }
  "auth.reset-password": { email: string; name: string; url: string }
  "auth.org-invitation": {
    email: string
    inviterName: string
    organizationName: string
    url: string
  }
  /** Raw token only exists in this job payload + the email. Never persisted. */
  "envelope.invite": { recipientId: string; token: string }
  "envelope.reminder": { recipientId: string; token: string }
  "envelope.completed": { envelopeId: string }
  "envelope.declined": { envelopeId: string; recipientId: string }
  "envelope.voided": { envelopeId: string }
  "recipient.otp": { recipientId: string; code: string; channel: "EMAIL_OTP" | "SMS_OTP" }
}

export interface FinalizeJobs {
  "envelope.finalize": { envelopeId: string }
}

export interface MaintenanceJobs {
  "envelopes.expire": Record<string, never>
  "envelopes.remind": Record<string, never>
  "documents.sweep-uploads": Record<string, never>
  "webhooks.sweep": Record<string, never>
  /** Daily: purge closed envelopes past their workspace's retention (docs/data-retention.md). */
  "retention.sweep": Record<string, never>
  /** Purge one closed envelope now (owner/admin request). */
  "envelope.purge": { envelopeId: string; reason: "retention" | "manual" }
  "export.build": { exportId: string }
  /** Daily: delete expired export archives. */
  "exports.cleanup": Record<string, never>
  /** After a workspace is deleted: remove everything under org/<id>/ in storage. */
  "organization.purge-storage": { organizationId: string }
  /** Create and send one envelope per row (docs/bulk-send.md). */
  "bulk.send": { bulkSendId: string }
}

export interface WebhookJobs {
  /** Retries and backoff: WEBHOOK_MAX_ATTEMPTS / webhookRetryDelayMs (@sahihi/core). */
  "webhook.deliver": { deliveryId: string }
}

export type JobName<M> = Extract<keyof M, string>

let connection: Redis | undefined
export function redis(): Redis {
  // maxRetriesPerRequest: null is required by BullMQ workers
  connection ??= new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null })
  return connection
}

class TypedQueue<M> {
  private queue: Queue
  constructor(name: string) {
    this.queue = new Queue(name, {
      connection: redis(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    })
  }
  add<N extends JobName<M>>(name: N, data: M[N], opts?: JobsOptions) {
    return this.queue.add(name, data, opts)
  }
  get raw() {
    return this.queue
  }
}

let queues:
  | {
      notifications: TypedQueue<NotificationJobs>
      finalize: TypedQueue<FinalizeJobs>
      maintenance: TypedQueue<MaintenanceJobs>
      webhooks: TypedQueue<WebhookJobs>
    }
  | undefined

export function getQueues() {
  queues ??= {
    notifications: new TypedQueue<NotificationJobs>(QUEUES.notifications),
    finalize: new TypedQueue<FinalizeJobs>(QUEUES.finalize),
    maintenance: new TypedQueue<MaintenanceJobs>(QUEUES.maintenance),
    webhooks: new TypedQueue<WebhookJobs>(QUEUES.webhooks),
  }
  return queues
}

/**
 * Enqueue webhook deliveries AFTER the transaction that created them has committed. The job id is
 * the delivery id, so enqueueing twice (e.g. the outbox sweep) never delivers twice.
 */
export async function enqueueWebhookDeliveries(
  deliveryIds: string[],
  /** A manual retry of a FAILED delivery needs a new job id (the failed job is kept for debugging). */
  { retryKey }: { retryKey?: string } = {},
) {
  const { webhooks } = getQueues()
  await Promise.all(
    deliveryIds.map((deliveryId) =>
      webhooks.add(
        "webhook.deliver",
        { deliveryId },
        {
          jobId: retryKey ? `whd-${deliveryId}-${retryKey}` : `whd-${deliveryId}`,
          attempts: WEBHOOK_MAX_ATTEMPTS,
          backoff: { type: "webhook" },
        },
      ),
    ),
  )
}
