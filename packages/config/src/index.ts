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
  /** Port the API listens on. Set by the host (Railway); locally it comes from API_URL. */
  PORT: z.coerce.number().int().positive().optional(),

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

  /**
   * Proxies in front of the API that append to X-Forwarded-For (docs/security.md → Rate limiting).
   * Railway's edge = 1 (the web's /api rewrite passes the header through unchanged). 0 = trust none.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  /**
   * Development/tests only: let webhook endpoints use http:// and private addresses (e.g. a local
   * receiver). Never set in production: it disables the SSRF protection (docs/webhooks.md).
   */
  WEBHOOKS_ALLOW_PRIVATE_URLS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // ── Observability (docs/observability.md) ──
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Error tracking; off when unset. */
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  /** Staff-only BullMQ dashboard at /admin/queues on the api; off unless both are set. */
  ADMIN_DASHBOARD_USER: z.string().min(1).optional(),
  ADMIN_DASHBOARD_PASSWORD: z.string().min(16, "Use at least 16 characters").optional(),

  SIGNING_LINK_TTL_DAYS: z.coerce.number().int().positive().default(14),
  SIGNING_PROVIDER: z.enum(["internal", "ca"]).default("internal"),

  // ── AI document assistant (docs/ai-documents.md) ──
  /**
   * `provider:model`, e.g. `anthropic:claude-sonnet-5-5` or `openai:<model>`. Unset = the
   * assistant is off everywhere; workspaces also have to turn it on.
   */
  AI_MODEL: z
    .string()
    .regex(/^(anthropic|openai):[\w.-]+$/, "Use provider:model, e.g. anthropic:claude-sonnet-5-5")
    .optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
})

export type Env = z.infer<typeof EnvSchema>

/** The key AI_MODEL's provider needs must be set too, so a typo fails at boot, not on first use. */
const CheckedEnvSchema = EnvSchema.superRefine((env, ctx) => {
  const provider = env.AI_MODEL?.split(":")[0]
  if (provider === "anthropic" && !env.ANTHROPIC_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["ANTHROPIC_API_KEY"], message: "Required by AI_MODEL" })
  }
  if (provider === "openai" && !env.OPENAI_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "Required by AI_MODEL" })
  }
})

let cached: Env | undefined

export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  if (cached) return cached
  const parsed = CheckedEnvSchema.safeParse(source)
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
  webhooks: "webhooks",
  documents: "documents",
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
