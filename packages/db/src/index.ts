import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated/prisma/client"
import { createSerializedPool } from "./pg-pool"

export { type AppendAuditInput, appendAuditEvent, toChainedEvent } from "./audit"
export {
  countAssistantTurns,
  countEnvelopesSent,
  countSeats,
  getOrgPlan,
  lockOrgQuota,
} from "./billing"
export * from "./generated/prisma/client"
export { notifyEnvelopeOwner, notifyUsers, notifyWorkspaceAdmins } from "./notifications"
export { issueSigningLink } from "./signing-links"
export { forOrganization } from "./tenant"
export { queueEnvelopeWebhook } from "./webhooks"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set")
  // Our own pool, so each connection runs one query at a time (see pg-pool.ts).
  return new PrismaClient({ adapter: new PrismaPg(createSerializedPool(connectionString)) })
}

/** Process-wide singleton (survives hot reloads in dev). */
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
