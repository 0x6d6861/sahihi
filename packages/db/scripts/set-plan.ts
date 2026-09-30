/**
 * Set a workspace's plan (docs/billing.md). Until a payment provider is wired in, this is how the
 * Sahihi team changes plans:
 *
 *   bun run billing:set-plan <organization-slug> <free|starter|business|enterprise>
 *
 * Uses DATABASE_URL (the app database). Prints the old and new plan.
 */
import { PLAN_IDS, PlanIdSchema } from "@sahihi/core"
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

await prisma.subscription.upsert({
  where: { organizationId: org.id },
  create: { organizationId: org.id, plan: plan.data },
  update: { plan: plan.data },
})
console.log(`${org.name} (${slug}): ${org.subscription?.plan ?? "free"} → ${plan.data}`)
await prisma.$disconnect()
