import { beforeEach, describe, expect, test } from "bun:test"
import { NOTIFICATION_TTL_DAYS } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { expireEnvelopes } from "../src/jobs/maintenance"
import { cleanupNotifications, purgeEnvelope } from "../src/jobs/retention"

// Runs via `bun run test:integration` (apps/api/test/preload.ts sets a *_test DATABASE_URL).
if (!new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.endsWith("_test")) {
  throw new Error("Integration tests must run via `bun run test:integration` (needs a *_test DB)")
}

const DAY = 86_400_000
let orgId: string
let userId: string
let documentId: string

beforeEach(async () => {
  const [db] = await prisma.$queryRaw<{ name: string }[]>`select current_database() as name`
  if (!db?.name.endsWith("_test")) throw new Error(`Refusing to truncate "${db?.name}"`)
  await prisma.$executeRawUnsafe(
    `truncate table "Notification", "Envelope", "Document", "member", "organization", "user" restart identity cascade`,
  )
  const user = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `${crypto.randomUUID()}@example.test` },
  })
  const org = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: "Ltd",
      slug: crypto.randomUUID(),
      createdAt: new Date(),
    },
  })
  await prisma.member.create({
    data: {
      id: crypto.randomUUID(),
      organizationId: org.id,
      userId: user.id,
      role: "owner",
      createdAt: new Date(),
    },
  })
  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      uploadedById: user.id,
      name: "lease.pdf",
      s3Key: `org/${org.id}/documents/x/original.pdf`,
      status: "READY",
    },
  })
  userId = user.id
  orgId = org.id
  documentId = doc.id
})

const envelope = (data: { status: "SENT" | "COMPLETED"; expiresAt?: Date; completedAt?: Date }) =>
  prisma.envelope.create({
    data: {
      organizationId: orgId,
      documents: { create: { documentId } },
      createdById: userId,
      title: "Lease",
      ...data,
    },
  })

describe("worker notifications", () => {
  test("expiring an envelope notifies its sender once", async () => {
    const e = await envelope({ status: "SENT", expiresAt: new Date(Date.now() - DAY) })
    await expireEnvelopes()
    await expireEnvelopes()
    const rows = await prisma.notification.findMany({ where: { userId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: "envelope.expired",
      envelopeId: e.id,
      organizationId: orgId,
      data: { envelopeTitle: "Lease" },
    })
  })

  test("purging an envelope deletes its notifications (they quote names)", async () => {
    const e = await envelope({ status: "COMPLETED", completedAt: new Date() })
    await prisma.notification.create({
      data: {
        organizationId: orgId,
        userId,
        type: "recipient.signed",
        envelopeId: e.id,
        data: { envelopeTitle: "Lease", recipientName: "Amina" },
      },
    })
    await purgeEnvelope(e.id, "manual")
    expect(await prisma.notification.count({ where: { envelopeId: e.id } })).toBe(0)
  })

  test("cleanup deletes notifications past the TTL, read or not", async () => {
    const now = new Date()
    const old = new Date(now.getTime() - (NOTIFICATION_TTL_DAYS + 1) * DAY)
    const recent = new Date(now.getTime() - (NOTIFICATION_TTL_DAYS - 1) * DAY)
    for (const [createdAt, readAt] of [
      [old, null],
      [old, now],
      [recent, null],
    ] as const) {
      await prisma.notification.create({
        data: { organizationId: orgId, userId, type: "export.ready", createdAt, readAt },
      })
    }
    expect(await cleanupNotifications(now)).toEqual({ deleted: 2 })
    expect(await prisma.notification.count()).toBe(1)
  })
})
