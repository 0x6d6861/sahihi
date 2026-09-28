import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { headObject, keys, putObject } from "@sahihi/infra"
import { sweepAbandonedUploads } from "../src/jobs/maintenance"

// Runs via `bun run test:integration` (apps/api/test/preload.ts sets a *_test DATABASE_URL).
if (!new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.endsWith("_test")) {
  throw new Error("Integration tests must run via `bun run test:integration` (needs a *_test DB)")
}

const HOUR = 3_600_000
const now = new Date("2026-09-26T12:00:00Z")
let orgId: string
let userId: string

beforeEach(async () => {
  const [db] = await prisma.$queryRaw<{ name: string }[]>`select current_database() as name`
  if (!db?.name.endsWith("_test")) throw new Error(`Refusing to truncate "${db?.name}"`)
  await prisma.$executeRawUnsafe(
    `truncate table "Document", "member", "organization", "user" restart identity cascade`,
  )
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name: "Sweeper",
      email: `${crypto.randomUUID()}@example.test`,
    },
  })
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Sweep Ltd", slug: crypto.randomUUID(), createdAt: now },
  })
  userId = user.id
  orgId = org.id
})

async function doc(status: "UPLOADING" | "READY" | "FAILED", ageMs: number, withObject = false) {
  const id = crypto.randomUUID()
  const s3Key = keys.original(orgId, id)
  if (withObject) await putObject(s3Key, new TextEncoder().encode("%PDF-1.7"), "application/pdf")
  return prisma.document.create({
    data: {
      id,
      organizationId: orgId,
      uploadedById: userId,
      name: `${status}.pdf`,
      s3Key,
      status,
      createdAt: new Date(now.getTime() - ageMs),
    },
  })
}

describe("sweepAbandonedUploads", () => {
  test("fails and soft-deletes stale uploads and removes their objects", async () => {
    const stale = await doc("UPLOADING", 2 * HOUR, true)
    const staleNoObject = await doc("UPLOADING", 3 * HOUR)

    expect(await sweepAbandonedUploads(now)).toEqual({ swept: 2 })

    for (const d of [stale, staleNoObject]) {
      const row = await prisma.document.findUniqueOrThrow({ where: { id: d.id } })
      expect(row.status).toBe("FAILED")
      expect(row.failureReason).toBe("Upload was not completed")
      expect(row.deletedAt).toEqual(now)
    }
    expect(await headObject(stale.s3Key)).toBeNull()
  })

  test("leaves recent uploads and finished documents alone", async () => {
    const recent = await doc("UPLOADING", 30 * 60_000, true)
    const ready = await doc("READY", 5 * HOUR, true)
    const failed = await doc("FAILED", 5 * HOUR)

    expect(await sweepAbandonedUploads(now)).toEqual({ swept: 0 })

    const rows = await prisma.document.findMany({ where: { id: { in: [recent.id, ready.id] } } })
    expect(rows.every((r) => r.deletedAt === null)).toBe(true)
    expect(await headObject(recent.s3Key)).not.toBeNull()
    expect(await headObject(ready.s3Key)).not.toBeNull()
    const failedRow = await prisma.document.findUniqueOrThrow({ where: { id: failed.id } })
    expect(failedRow.deletedAt).toBeNull()
  })

  test("is idempotent", async () => {
    await doc("UPLOADING", 2 * HOUR, true)
    expect(await sweepAbandonedUploads(now)).toEqual({ swept: 1 })
    expect(await sweepAbandonedUploads(now)).toEqual({ swept: 0 })
  })
})
