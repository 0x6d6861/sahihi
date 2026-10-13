/**
 * Set a workspace's plan (docs/billing.md). Until a payment provider is wired in, this is how the
 * Sahihi team changes plans:
 *
 *   bun run billing:set-plan <organization-slug> <free|starter|business|enterprise>
 *
 * Uses DATABASE_URL (the app database). Prints the old and new plan.
 */
import { PLAN_IDS, PLANS, PlanIdSchema } from "@sahihi/core"
import { prisma } from "../src/index"

const [slug, planArg] = process.argv.slice(2)
const plan = PlanIdSchema.safeParse(planArg)
if (!slug || !plan.success) {
  console.error(`Usage: bun run billing:set-plan <organization-slug> <${PLAN_IDS.join("|")}>`)
  process.exit(1)
}

const org = await prisma.organization.findUnique({
  where: { slug },
  select: { id: true, name: true, subscription: { select: { plan: true } } },
})
if (!org) {
  console.error(`No organization with slug "${slug}"`)
  process.exit(1)
}

// Own storage (docs/storage.md): files in the workspace's bucket must come back first, and sync
// destinations pause (their deliveries fail as "paused" until the plan includes sync again).
const primary = await prisma.storageConnection.findFirst({
  where: { organizationId: org.id, purpose: "PRIMARY", primaryState: { not: null } },
  select: { name: true, primaryState: true },
})
if (primary && PLANS[plan.data].ownStorage !== "primary") {
  console.error(
    `${org.name} keeps its files in its own storage ("${primary.name}", ${primary.primaryState}). ` +
      "Disconnect it in Settings → Storage and wait for the files to move back before downgrading.",
  )
  process.exit(1)
}
const syncing = await prisma.storageConnection.count({
  where: { organizationId: org.id, purpose: "SYNC" },
})
if (syncing > PLANS[plan.data].storageDestinations) {
  console.warn(
    `Note: ${syncing} sync destination(s) connected; the ${PLANS[plan.data].name} plan allows ` +
      `${PLANS[plan.data].storageDestinations}. Existing ones keep working${PLANS[plan.data].ownStorage === "none" ? " only after an upgrade (sync pauses)" : ""}; new ones can't be added.`,
  )
}

await prisma.subscription.upsert({
  where: { organizationId: org.id },
  create: { organizationId: org.id, plan: plan.data },
  update: { plan: plan.data },
})
console.log(`${org.name} (${slug}): ${org.subscription?.plan ?? "free"} → ${plan.data}`)
await prisma.$disconnect()
