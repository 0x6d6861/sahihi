import { beforeEach, describe, expect, test } from "bun:test"
import { appendAuditEvent, prisma } from "@sahihi/db"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

interface Item {
  id: string
  type: string
  envelopeId: string
  envelopeTitle: string
  recipientName: string | null
  actorName: string | null
  [key: string]: unknown
}
interface Page {
  items: Item[]
  nextCursor: string | null
  people?: { id: string; name: string }[]
}

let alice: Sender

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
})

const list = async (s: Sender, query = "") => {
  const res = await request(s, `/api/activity${query}`)
  expect(res.status).toBe(200)
  return (await res.json()) as Page
}

async function draft(owner: Sender, title: string) {
  const { document } = await uploadDocument(owner)
  const res = await request(owner, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title },
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { envelope: { id: string } }).envelope.id
}

const append = (
  envelopeId: string,
  type: Parameters<typeof appendAuditEvent>[1]["type"],
  data?: Record<string, unknown>,
) =>
  prisma.$transaction((tx) =>
    appendAuditEvent(tx, {
      envelopeId,
      type,
      data,
      ipAddress: "203.0.113.9",
      userAgent: "Test/1.0",
    }),
  )

describe("workspace activity", () => {
  test("shows every member's envelopes, newest first, with the actor's name", async () => {
    const bob = await joinOrganization(alice, "bob", "member")
    await draft(alice, "Lease")
    await draft(bob, "NDA")
    const page = await list(bob)
    expect(page.items.map((i) => [i.type, i.envelopeTitle, i.actorName])).toEqual([
      ["envelope.created", "NDA", "bob"],
      ["envelope.created", "Lease", "alice"],
    ])
    expect(page.nextCursor).toBeNull()
  })

  test("never shows another workspace's events", async () => {
    const eve = await createSender("eve")
    await draft(eve, "Secret")
    await draft(alice, "Lease")
    expect((await list(alice)).items.map((i) => i.envelopeTitle)).toEqual(["Lease"])
    expect((await list(eve)).items.map((i) => i.envelopeTitle)).toEqual(["Secret"])
  })

  test("leaves out IP addresses, user agents and hashes, also inside the event's data", async () => {
    const envelopeId = await draft(alice, "Lease")
    await append(envelopeId, "envelope.sent")
    await append(envelopeId, "document.finalized", {
      name: "Lease.pdf",
      signedS3Key: "signed/x.pdf",
      signedSha256: "ab".repeat(32),
    })
    await append(envelopeId, "certificate.issued", { code: "SAH-1", sha256: "cd".repeat(32) })
    const items = (await list(alice)).items
    expect(items.map((i) => i.type)).toEqual([
      "certificate.issued",
      "document.finalized",
      "envelope.sent",
      "envelope.created",
    ])
    for (const item of items) {
      for (const key of ["ipAddress", "userAgent", "hash", "prevHash", "seq", "actorUserId"]) {
        expect(item).not.toHaveProperty(key)
      }
    }
    expect(items[0]?.data).toBeNull()
    expect(items[1]?.data).toEqual({ name: "Lease.pdf" })
    expect(JSON.stringify(items)).not.toContain("ab".repeat(32))
  })

  test("filters by group and hides step-by-step noise", async () => {
    const envelopeId = await draft(alice, "Lease")
    await append(envelopeId, "recipient.field_filled")
    await append(envelopeId, "certificate.issued")
    expect((await list(alice)).items.map((i) => i.type)).toEqual([
      "certificate.issued",
      "envelope.created",
    ])
    expect((await list(alice, "?group=system")).items.map((i) => i.type)).toEqual([
      "certificate.issued",
    ])
    expect((await list(alice, "?group=sending")).items.map((i) => i.type)).toEqual([
      "envelope.created",
    ])
  })

  test("pages with a cursor", async () => {
    for (const title of ["A", "B", "C"]) await draft(alice, title)
    const first = await list(alice, "?limit=2")
    expect(first.items.map((i) => i.envelopeTitle)).toEqual(["C", "B"])
    expect(first.nextCursor).not.toBeNull()
    const second = await list(alice, `?limit=2&cursor=${first.nextCursor}`)
    expect(second.items.map((i) => i.envelopeTitle)).toEqual(["A"])
    expect(second.nextCursor).toBeNull()
    expect((await request(alice, "/api/activity?cursor=nope")).status).toBe(400)
  })

  test("needs a workspace", async () => {
    expect((await request(null, "/api/activity")).status).toBe(401)
  })

  test("searches envelope titles, recipient and member names; filters by person and period", async () => {
    const bob = await joinOrganization(alice, "bob", "member")
    const lease = await draft(alice, "Office Lease")
    await draft(bob, "NDA")
    const recipient = await prisma.recipient.create({
      data: { envelopeId: lease, name: "Amina Otieno", email: "amina@example.test", order: 1 },
    })
    await prisma.$transaction((tx) =>
      appendAuditEvent(tx, {
        envelopeId: lease,
        type: "recipient.signed",
        recipientId: recipient.id,
      }),
    )
    const titles = async (query: string) =>
      (await list(alice, query)).items.map((i) => `${i.type} ${i.envelopeTitle}`)

    expect(await titles("?q=lease")).toEqual([
      "recipient.signed Office Lease",
      "envelope.created Office Lease",
    ])
    expect(await titles("?q=AMINA")).toEqual(["recipient.signed Office Lease"])
    expect(await titles("?q=bob")).toEqual(["envelope.created NDA"])
    expect(await titles(`?actor=${bob.userId}`)).toEqual(["envelope.created NDA"])
    expect(await titles("?period=7d")).toHaveLength(3)

    const first = await list(alice, "?limit=1")
    expect(first.people?.map((p) => p.name).sort()).toEqual(["alice", "bob"])
    // Members are sent with the first page only.
    expect((await list(alice, `?limit=1&cursor=${first.nextCursor}`)).people).toBeUndefined()

    // A former member's events can still be found by their name.
    await prisma.member.deleteMany({ where: { userId: bob.userId } })
    expect(await titles("?q=bob")).toEqual(["envelope.created NDA"])
  })
})
