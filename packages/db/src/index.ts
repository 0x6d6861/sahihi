import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated/prisma/client"

export { type AppendAuditInput, appendAuditEvent, toChainedEvent } from "./audit"
export * from "./generated/prisma/client"
export { issueSigningLink } from "./signing-links"
export { forOrganization } from "./tenant"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set")
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

/** Process-wide singleton (survives hot reloads in dev). */
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
