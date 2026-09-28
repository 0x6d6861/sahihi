import { beforeEach, describe, expect, test } from "bun:test"
import { appendAuditEvent, type Prisma, prisma } from "@sahihi/db"
import { auth } from "../src/auth"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

/**
 * docs/security.md → Audit trail integrity, ADR 0010. The api and worker run as a login role in
 * `sahihi_app`; these tests assume that role with `SET LOCAL ROLE` inside a transaction.
 */

let alice: Sender
let envelopeId: string
let recipientId: string

/** Runs `fn` as sahihi_app; returns the database error message, or null on success. */
async function asApp(fn: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE sahihi_app")
      await fn(tx)
    })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** Same, as the table owner (the migrations user). */
async function asOwner(fn: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  try {
    await prisma.$transaction(fn)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  const { document } = await uploadDocument(alice)
  const created = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Evidence" },
  })
  envelopeId = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const put = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Signer", email: "signer@example.test" }] },
  })
  const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  if (!r) throw new Error("no recipient")
  recipientId = r.id
  await request(alice, `/api/envelopes/${envelopeId}/fields`, {
    method: "PUT",
    json: {
      fields: [
        { recipientId, type: "SIGNATURE", page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.06 },
      ],
    },
  })
  expect(
    (await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })).status,
  ).toBe(200)
})

describe("sahihi_app role", () => {
  test("appends audit events and writes other tables; the chain still verifies", async () => {
    const error = await asApp(async (tx) => {
      await appendAuditEvent(tx, { envelopeId, type: "recipient.viewed", recipientId })
      await tx.envelope.update({ where: { id: envelopeId }, data: { title: "Evidence (renamed)" } })
    })
    expect(error).toBeNull()
    const audit = await request(alice, `/api/envelopes/${envelopeId}/audit`)
    const body = (await audit.json()) as {
      events: { type: string }[]
      verification: { valid: boolean }
    }
    expect(body.events.at(-1)?.type).toBe("recipient.viewed")
    expect(body.verification.valid).toBe(true)
  })

  test("can't update, delete or truncate AuditEvent", async () => {
    const before = await prisma.auditEvent.findMany({
      where: { envelopeId },
      orderBy: { seq: "asc" },
    })
    expect(before.length).toBeGreaterThan(1)

    expect(
      await asApp(
        (tx) =>
          tx.$executeRaw`UPDATE "AuditEvent" SET "type" = 'forged' WHERE "envelopeId" = ${envelopeId}`,
      ),
    ).toMatch(/permission denied/)
    expect(
      await asApp(
        (tx) => tx.$executeRaw`DELETE FROM "AuditEvent" WHERE "envelopeId" = ${envelopeId}`,
      ),
    ).toMatch(/permission denied/)
    expect(await asApp((tx) => tx.$executeRawUnsafe(`TRUNCATE "AuditEvent" CASCADE`))).toMatch(
      /permission denied/,
    )
    // The Prisma client API goes through the same privileges.
    expect(await asApp((tx) => tx.auditEvent.deleteMany({ where: { envelopeId } }))).toMatch(
      /permission denied/,
    )

    expect(
      await prisma.auditEvent.findMany({ where: { envelopeId }, orderBy: { seq: "asc" } }),
    ).toEqual(before)
  })

  test("can't read or write Prisma's migration history", async () => {
    expect(
      await asApp((tx) => tx.$queryRawUnsafe(`SELECT count(*) FROM "_prisma_migrations"`)),
    ).toMatch(/permission denied/)
  })
})

describe("append-only for everyone", () => {
  test("even the owner can't UPDATE an audit event (trigger)", async () => {
    expect(
      await asOwner(
        (tx) =>
          tx.$executeRaw`UPDATE "AuditEvent" SET "type" = 'forged' WHERE "envelopeId" = ${envelopeId}`,
      ),
    ).toMatch(/append-only/)
  })

  test("a recipient with audit events can't be deleted on its own (evidence keeps its link)", async () => {
    expect(
      await asOwner((tx) => tx.recipient.delete({ where: { id: recipientId } })),
    ).not.toBeNull()
    expect(await prisma.recipient.count({ where: { id: recipientId } })).toBe(1)
  })

  test("deleting the organization still cascades (retention/deletion is a separate feature)", async () => {
    await auth.api.deleteOrganization({
      body: { organizationId: alice.organizationId },
      headers: new Headers({ cookie: alice.cookie }),
    })
    expect(await prisma.envelope.count({ where: { id: envelopeId } })).toBe(0)
    expect(await prisma.auditEvent.count({ where: { envelopeId } })).toBe(0)
  })
})
