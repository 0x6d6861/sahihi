import { z } from "zod"

/**
 * Server-side environment. Parse once at process start; never import from client code.
 * Add new variables here AND in `.env.example`.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  WEB_URL: z.string().url(),
  API_URL: z.string().url(),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  EMAIL_TRANSPORT: z.enum(["smtp", "postmark"]).default("smtp"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  EMAIL_FROM: z.string(),

  AT_USERNAME: z.string().optional(),
  AT_API_KEY: z.string().optional(),
  AT_SENDER_ID: z.string().optional(),

  SIGNING_LINK_TTL_DAYS: z.coerce.number().int().positive().default(14),
  SIGNING_PROVIDER: z.enum(["internal", "ca"]).default("internal"),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | undefined

export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(`Invalid environment:\n${issues}`)
  }
  cached = parsed.data
  return cached
}

/** Queue names shared by api (producer) and worker (consumer). */
export const QUEUES = {
  notifications: "notifications",
  finalize: "envelope-finalize",
  maintenance: "maintenance",
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
