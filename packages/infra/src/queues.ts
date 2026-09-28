import { getEnv, QUEUES } from "@sahihi/config"
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
    }
  | undefined

export function getQueues() {
  queues ??= {
    notifications: new TypedQueue<NotificationJobs>(QUEUES.notifications),
    finalize: new TypedQueue<FinalizeJobs>(QUEUES.finalize),
    maintenance: new TypedQueue<MaintenanceJobs>(QUEUES.maintenance),
  }
  return queues
}
