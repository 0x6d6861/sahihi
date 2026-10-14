import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { CONSENT_VERSION } from "@sahihi/core"
import { notifyUsers, prisma, signalNotifications } from "@sahihi/db"
import { getQueues } from "@sahihi/infra"
import { auth } from "../src/auth"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// 1×1 transparent PNG
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

interface Item {
  id: string
  type: string
  envelopeId: string | null
  data: Record<string, unknown>
  readAt: string | null
}
interface Page {
  items: Item[]
  nextCursor: string | null
  unreadCount: number
}

let alice: Sender

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
})

const list = async (s: Sender, query = "") =>
  (await (await request(s, `/api/notifications${query}`)).json()) as Page

const typesOf = async (s: Sender) => (await list(s)).items.map((i) => i.type)

/** A sent, parallel envelope with one signature field per recipient. */
async function sentEnvelope(owner: Sender, names: string[], title = "Lease") {
  const { document } = await uploadDocument(owner)
  const created = await request(owner, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title },
  })
  const envelopeId = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const put = await request(owner, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: {
      recipients: names.map((name) => ({ name, email: `${name.toLowerCase()}@example.test` })),
    },
  })
  const recipients = ((await put.json()) as { recipients: { id: string; name: string }[] })
    .recipients
  const fields = await request(owner, `/api/envelopes/${envelopeId}/fields`, {
    method: "PUT",
    json: {
      fields: recipients.map((r, i) => ({
        recipientId: r.id,
        type: "SIGNATURE",
        page: 1,
        x: 0.1,
        y: 0.1 + i * 0.1,
        width: 0.2,
        height: 0.05,
      })),
    },
  })
  const saved = ((await fields.json()) as { fields: { id: string; recipientId: string }[] }).fields
  const sent = await request(owner, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
  expect(sent.status).toBe(200)
  const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
  const tokenOf = (recipientId: string) =>
    jobs
      .filter((j) => j.name === "envelope.invite" && j.data.recipientId === recipientId)
      .sort((a, b) => b.timestamp - a.timestamp)[0]?.data.token as string
  return {
    envelopeId,
    signers: recipients.map((r) => ({
      ...r,
      token: tokenOf(r.id),
      fieldId: saved.find((f) => f.recipientId === r.id)?.id as string,
    })),
  }
}

const sign = (token: string, fieldId: string) =>
  request(null, `/api/sign/${token}/submit`, {
    method: "POST",
    json: {
      consent: true,
      consentVersion: CONSENT_VERSION,
      values: [{ kind: "image", fieldId, dataUrl: PNG }],
    },
  })

describe("envelope events", () => {
  test("a signature that isn't the last notifies the sender; opening doesn't by default", async () => {
    const { envelopeId, signers } = await sentEnvelope(alice, ["Amina", "Baraka"])
    const [amina] = signers
    if (!amina) throw new Error("no signer")
    expect((await request(null, `/api/sign/${amina.token}/file`)).status).toBe(200)
    expect(await typesOf(alice)).toEqual([])

    expect((await sign(amina.token, amina.fieldId)).status).toBe(200)
    const page = await list(alice)
    expect(page.unreadCount).toBe(1)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      type: "recipient.signed",
      envelopeId,
      data: { envelopeTitle: "Lease", recipientName: "Amina" },
      readAt: null,
    })
  })

  test("the last signature is not reported as signed (finalize reports completed)", async () => {
    const { signers } = await sentEnvelope(alice, ["Amina"])
    const [amina] = signers
    if (!amina) throw new Error("no signer")
    expect((await sign(amina.token, amina.fieldId)).status).toBe(200)
    expect(await typesOf(alice)).toEqual([])
  })

  test("opening is reported once the sender turns it on", async () => {
    const put = await request(alice, "/api/notifications/preferences", {
      method: "PUT",
      json: { settings: { "recipient.viewed": true } },
    })
    expect(put.status).toBe(200)
    const { signers } = await sentEnvelope(alice, ["Amina"])
    const token = signers[0]?.token as string
    await request(null, `/api/sign/${token}/file`)
    await request(null, `/api/sign/${token}/file`)
    expect(await typesOf(alice)).toEqual(["recipient.viewed"])
  })

  test("two first views at once are one view: one notification, one audit event", async () => {
    await request(alice, "/api/notifications/preferences", {
      method: "PUT",
      json: { settings: { "recipient.viewed": true } },
    })
    const { envelopeId, signers } = await sentEnvelope(alice, ["Amina"])
    const token = signers[0]?.token as string
    const views = await Promise.all([1, 2, 3].map(() => request(null, `/api/sign/${token}/file`)))
    expect(views.map((r) => r.status)).toEqual([200, 200, 200])
    expect(await typesOf(alice)).toEqual(["recipient.viewed"])
    const audits = await prisma.auditEvent.count({
      where: { envelopeId, type: "recipient.viewed" },
    })
    expect(audits).toBe(1)
  })

  test("a sender who signs their own envelope isn't told about it", async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: alice.userId } })
    const { signers } = await sentEnvelope(alice, ["Amina", "Self"])
    const self = signers[1]
    if (!self) throw new Error("no signer")
    await prisma.recipient.update({ where: { id: self.id }, data: { email: me.email } })
    expect((await sign(self.token, self.fieldId)).status).toBe(200)
    expect(await typesOf(alice)).toEqual([])
  })

  test("a decline is reported with its reason", async () => {
    const { signers } = await sentEnvelope(alice, ["Amina"])
    const res = await request(null, `/api/sign/${signers[0]?.token}/decline`, {
      method: "POST",
      json: { reason: "Wrong address" },
    })
    expect(res.status).toBe(200)
    const [item] = (await list(alice)).items
    expect(item).toMatchObject({
      type: "envelope.declined",
      data: { recipientName: "Amina", reason: "Wrong address" },
    })
  })

  test("voiding notifies the sender only when someone else voided", async () => {
    const admin = await joinOrganization(alice, "admin", "admin")
    const mine = await sentEnvelope(alice, ["Amina"], "Mine")
    await request(alice, `/api/envelopes/${mine.envelopeId}/void`, {
      method: "POST",
      json: { reason: "Typo" },
    })
    expect(await typesOf(alice)).toEqual([])

    const other = await sentEnvelope(alice, ["Amina"], "Other")
    const res = await request(admin, `/api/envelopes/${other.envelopeId}/void`, {
      method: "POST",
      json: { reason: "Client cancelled" },
    })
    expect(res.status).toBe(200)
    const [item] = (await list(alice)).items
    expect(item).toMatchObject({
      type: "envelope.voided",
      envelopeId: other.envelopeId,
      data: { actorName: "admin", reason: "Client cancelled", envelopeTitle: "Other" },
    })
    expect(await typesOf(admin)).toEqual([])
  })

  test("a type turned off writes nothing", async () => {
    await request(alice, "/api/notifications/preferences", {
      method: "PUT",
      json: { settings: { "envelope.declined": false } },
    })
    const { signers } = await sentEnvelope(alice, ["Amina"])
    await request(null, `/api/sign/${signers[0]?.token}/decline`, {
      method: "POST",
      json: { reason: "No" },
    })
    expect(await typesOf(alice)).toEqual([])
  })
})

describe("workspace events", () => {
  test("owners and admins hear when someone accepts an invitation; members don't", async () => {
    const admin = await joinOrganization(alice, "admin", "admin")
    const member = await joinOrganization(alice, "member", "member")
    const email = `joiner-${crypto.randomUUID().slice(0, 6)}@example.test`
    const invitation = await auth.api.createInvitation({
      body: { email, role: "member", organizationId: alice.organizationId },
      headers: new Headers({ cookie: alice.cookie }),
    })
    const password = `pw-${crypto.randomUUID()}`
    const { user } = await auth.api.signUpEmail({ body: { email, password, name: "Wanjiru" } })
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    const signIn = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ")
    await auth.api.acceptInvitation({
      body: { invitationId: invitation.id },
      headers: new Headers({ cookie }),
    })

    for (const s of [alice, admin]) {
      const [item] = (await list(s)).items
      expect(item).toMatchObject({ type: "member.joined", data: { memberName: "Wanjiru" } })
    }
    expect(await typesOf(member)).toEqual([])
    const joined = await prisma.notification.count({ where: { userId: user.id } })
    expect(joined).toBe(0)
  })

  test("the send that reaches 80% of the quota warns admins once; the last one says so", async () => {
    const free = await createSender("free", { plan: "free" })
    const member = await joinOrganization(free, "member", "member")
    // Free: 5 a month. Three already sent this period.
    const { document } = await uploadDocument(free)
    for (let i = 0; i < 3; i++) {
      await prisma.envelope.create({
        data: {
          organizationId: free.organizationId,
          documents: { create: { documentId: document.id } },
          createdById: free.userId,
          title: `Earlier ${i}`,
          status: "SENT",
          sentAt: new Date(),
        },
      })
    }
    await sentEnvelope(member, ["Amina"], "Fourth")
    expect(await typesOf(free)).toEqual(["billing.quota_warning"])
    const [warning] = (await list(free)).items
    expect(warning?.data).toEqual({ planName: "Free", used: 4, limit: 5 })
    expect(await typesOf(member)).toEqual([])

    await sentEnvelope(free, ["Baraka"], "Fifth")
    expect(await typesOf(free)).toEqual(["billing.quota_reached", "billing.quota_warning"])
  })
})

describe("API", () => {
  async function seed(sender: Sender, count: number) {
    for (let i = 0; i < count; i++) {
      await notifyUsers(prisma, {
        organizationId: sender.organizationId,
        userIds: [sender.userId],
        type: "export.ready",
        data: { envelopeCount: i },
      })
    }
  }

  test("pages newest first with a cursor", async () => {
    await seed(alice, 5)
    const first = await list(alice, "?limit=2")
    expect(first.items.map((i) => i.data.envelopeCount)).toEqual([4, 3])
    expect(first.unreadCount).toBe(5)
    const second = await list(alice, `?limit=2&cursor=${first.nextCursor}`)
    expect(second.items.map((i) => i.data.envelopeCount)).toEqual([2, 1])
    const third = await list(alice, `?limit=2&cursor=${second.nextCursor}`)
    expect(third.items.map((i) => i.data.envelopeCount)).toEqual([0])
    expect(third.nextCursor).toBeNull()
  })

  test("a cursor still pages after its item was dismissed", async () => {
    await seed(alice, 4)
    const first = await list(alice, "?limit=2")
    const lastId = first.items.at(-1)?.id
    await request(alice, "/api/notifications/dismiss", { method: "POST", json: { ids: [lastId] } })
    const second = await list(alice, `?limit=2&cursor=${first.nextCursor}`)
    expect(second.items.map((i) => i.data.envelopeCount)).toEqual([1, 0])
    expect((await request(alice, "/api/notifications?cursor=not-a-cursor")).status).toBe(400)
  })

  test("mark some or all as read", async () => {
    await seed(alice, 3)
    const { items } = await list(alice)
    const one = await request(alice, "/api/notifications/read", {
      method: "POST",
      json: { ids: [items[0]?.id] },
    })
    expect(await one.json()).toEqual({ updated: 1 })
    expect(await (await request(alice, "/api/notifications/unread-count")).json()).toEqual({
      count: 2,
    })
    expect((await list(alice, "?unread=1")).items).toHaveLength(2)

    await request(alice, "/api/notifications/read", { method: "POST", json: { all: true } })
    expect((await list(alice)).unreadCount).toBe(0)
  })

  test("mark unread and dismiss", async () => {
    await seed(alice, 3)
    const [a, b] = (await list(alice)).items
    await request(alice, "/api/notifications/read", { method: "POST", json: { all: true } })
    const unread = await request(alice, "/api/notifications/unread", {
      method: "POST",
      json: { ids: [a?.id] },
    })
    expect(await unread.json()).toEqual({ updated: 1 })
    expect((await list(alice)).unreadCount).toBe(1)

    const dismissed = await request(alice, "/api/notifications/dismiss", {
      method: "POST",
      json: { ids: [a?.id, b?.id] },
    })
    expect(await dismissed.json()).toEqual({ deleted: 2 })
    expect((await list(alice)).items).toHaveLength(1)
    const all = await request(alice, "/api/notifications/dismiss", {
      method: "POST",
      json: { all: true },
    })
    expect(all.status).toBe(400)
  })

  test("other users and other workspaces can't see or mark yours", async () => {
    await seed(alice, 2)
    const colleague = await joinOrganization(alice, "colleague", "admin")
    const stranger = await createSender("stranger")
    const { items } = await list(alice)
    const ids = items.map((i) => i.id)
    const aliceCursor = (await list(alice, "?limit=1")).nextCursor

    for (const s of [colleague, stranger]) {
      expect((await list(s)).items).toEqual([])
      const res = await request(s, "/api/notifications/read", { method: "POST", json: { ids } })
      expect(await res.json()).toEqual({ updated: 0 })
      const unread = await request(s, "/api/notifications/unread", {
        method: "POST",
        json: { ids },
      })
      expect(await unread.json()).toEqual({ updated: 0 })
      const gone = await request(s, "/api/notifications/dismiss", { method: "POST", json: { ids } })
      expect(await gone.json()).toEqual({ deleted: 0 })
      // A cursor is only a position: following alice's still lists only the caller's own.
      const page = await list(s, `?limit=1&cursor=${aliceCursor}`)
      expect(page.items).toEqual([])
    }
    expect((await list(alice)).unreadCount).toBe(2)
    expect((await list(alice)).items).toHaveLength(2)
  })

  test("a notification in another workspace of yours stays there", async () => {
    await seed(alice, 1)
    const other = await prisma.organization.create({
      data: {
        id: crypto.randomUUID(),
        name: "Other",
        slug: crypto.randomUUID(),
        createdAt: new Date(),
      },
    })
    await prisma.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: other.id,
        userId: alice.userId,
        role: "owner",
        createdAt: new Date(),
      },
    })
    await notifyUsers(prisma, {
      organizationId: other.id,
      userIds: [alice.userId],
      type: "export.failed",
    })
    expect(await typesOf(alice)).toEqual(["export.ready"])
  })

  test("preferences: defaults, per-role types, merging", async () => {
    const member = await joinOrganization(alice, "member", "member")
    const get = async (s: Sender) =>
      (
        (await (await request(s, "/api/notifications/preferences")).json()) as {
          items: { type: string; enabled: boolean }[]
        }
      ).items
    const owner = await get(alice)
    expect(owner.find((i) => i.type === "recipient.viewed")?.enabled).toBe(false)
    expect(owner.find((i) => i.type === "member.joined")?.enabled).toBe(true)
    expect((await get(member)).some((i) => i.type === "member.joined")).toBe(false)

    await request(alice, "/api/notifications/preferences", {
      method: "PUT",
      json: { settings: { "member.joined": false } },
    })
    await request(alice, "/api/notifications/preferences", {
      method: "PUT",
      json: { settings: { "recipient.viewed": true } },
    })
    const after = await get(alice)
    expect(after.find((i) => i.type === "member.joined")?.enabled).toBe(false)
    expect(after.find((i) => i.type === "recipient.viewed")?.enabled).toBe(true)
    // Preferences belong to the user, not the workspace.
    expect((await get(member)).find((i) => i.type === "recipient.viewed")?.enabled).toBe(false)

    const bad = await request(alice, "/api/notifications/preferences", {
      method: "PUT",
      json: { settings: { "made.up": true } },
    })
    expect(bad.status).toBe(400)
  })

  test("needs a session", async () => {
    expect((await request(null, "/api/notifications")).status).toBe(401)
  })

  test("people who left the workspace get nothing", async () => {
    const written = await notifyUsers(prisma, {
      organizationId: alice.organizationId,
      userIds: [alice.userId, "not-a-member"],
      type: "export.ready",
    })
    expect(written).toBe(1)
  })
})

describe("Inbox search and filters", () => {
  async function seed() {
    const write = (type: Parameters<typeof notifyUsers>[1]["type"], data = {}) =>
      notifyUsers(prisma, {
        organizationId: alice.organizationId,
        userIds: [alice.userId],
        type,
        data,
      })
    await write("recipient.signed", { envelopeTitle: "Office Lease", recipientName: "Amina" })
    await write("envelope.declined", {
      envelopeTitle: "NDA",
      recipientName: "Baraka",
      reason: "Wrong lease date",
    })
    await write("export.ready", { envelopeCount: 3 })
    const old = await prisma.notification.findFirstOrThrow({ where: { type: "export.ready" } })
    await prisma.notification.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 40 * 86_400_000), readAt: new Date() },
    })
  }

  test("q searches the quoted names and titles, any case", async () => {
    await seed()
    expect((await list(alice, "?q=LEASE")).items.map((i) => i.type).sort()).toEqual([
      "envelope.declined",
      "recipient.signed",
    ])
    expect((await list(alice, "?q=amina")).items.map((i) => i.type)).toEqual(["recipient.signed"])
    expect((await list(alice, "?q=nobody")).items).toEqual([])
  })

  test("type, read state and period", async () => {
    await seed()
    expect((await list(alice, "?type=envelope.declined")).items.map((i) => i.type)).toEqual([
      "envelope.declined",
    ])
    expect((await list(alice, "?read=1")).items.map((i) => i.type)).toEqual(["export.ready"])
    expect((await list(alice, "?unread=1")).items).toHaveLength(2)
    expect((await list(alice, "?period=30d")).items.map((i) => i.type)).not.toContain(
      "export.ready",
    )
    // The badge's count ignores the filters.
    expect((await list(alice, "?type=export.ready")).unreadCount).toBe(2)
    expect((await request(alice, "/api/notifications?type=nope")).status).toBe(400)
  })
})

describe("live stream", () => {
  const open: (() => Promise<void>)[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map((close) => close()))
  })

  /**
   * Opens `/api/notifications/stream` as `s` and reads its first count. Extra counts sent while
   * the listener connects are drained, so `next` only sees what a test causes.
   */
  async function openStream(s: Sender) {
    const res = await request(s, "/api/notifications/stream")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform")
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    open.push(() => reader.cancel())
    const decoder = new TextDecoder()
    let buffer = ""
    let pending: ReturnType<typeof reader.read> | null = null
    /** The next `count` event within `ms`, or null. */
    const next = async (ms = 3_000): Promise<number | null> => {
      const deadline = Date.now() + ms
      for (;;) {
        const end = buffer.indexOf("\n\n")
        if (end >= 0) {
          const event = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const data = event.match(/^event: count\ndata: (.*)$/m)?.[1]
          if (data) return (JSON.parse(data) as { count: number }).count
          continue
        }
        const left = deadline - Date.now()
        if (left <= 0) return null
        pending ??= reader.read()
        const read = await Promise.race([pending, Bun.sleep(left).then(() => "timeout" as const)])
        if (read === "timeout") return null
        pending = null
        if (read.done) return null
        buffer += decoder.decode(read.value, { stream: true })
      }
    }
    const first = await next()
    while ((await next(600)) !== null) {}
    return { first, next }
  }

  const seed = (s: Sender) =>
    notifyUsers(prisma, {
      organizationId: s.organizationId,
      userIds: [s.userId],
      type: "export.ready",
      data: { envelopeCount: 1 },
    })

  test("sends the count on open and again when a recipient signs", async () => {
    await seed(alice)
    const stream = await openStream(alice)
    expect(stream.first).toBe(1)
    const { signers } = await sentEnvelope(alice, ["Amina", "Baraka"])
    const [amina] = signers
    if (!amina) throw new Error("no signer")
    expect((await sign(amina.token, amina.fieldId)).status).toBe(200)
    expect(await stream.next()).toBe(2)
  })

  test("a rolled-back notification sends nothing", async () => {
    const stream = await openStream(alice)
    expect(stream.first).toBe(0)
    await prisma
      .$transaction(async (tx) => {
        await notifyUsers(tx, {
          organizationId: alice.organizationId,
          userIds: [alice.userId],
          type: "export.ready",
        })
        throw new Error("roll back")
      })
      .catch(() => {})
    expect(await stream.next(1_000)).toBeNull()
  })

  test("other users and other workspaces of yours hear nothing", async () => {
    const bob = await createSender("bob")
    const carol = await joinOrganization(alice, "carol", "member")
    const bobs = await openStream(bob)
    const carols = await openStream(carol)
    const alices = await openStream(alice)
    await seed(alice)
    expect(await alices.next()).toBe(1)
    // A signal for Alice in Bob's workspace doesn't reach Alice's stream in hers.
    await signalNotifications(prisma, bob.organizationId, [alice.userId])
    expect(await alices.next(1_000)).toBeNull()
    expect(await bobs.next(500)).toBeNull()
    expect(await carols.next(500)).toBeNull()
  })

  test("reading in one tab updates the others", async () => {
    await seed(alice)
    const [tabA, tabB] = [await openStream(alice), await openStream(alice)]
    expect([tabA.first, tabB.first]).toEqual([1, 1])
    const read = await request(alice, "/api/notifications/read", {
      method: "POST",
      json: { all: true },
    })
    expect(read.status).toBe(200)
    expect([await tabA.next(), await tabB.next()]).toEqual([0, 0])
  })

  test("needs a session, and caps the streams one user holds", async () => {
    expect((await request(null, "/api/notifications/stream")).status).toBe(401)
    for (let i = 0; i < 10; i++) {
      const res = await request(alice, "/api/notifications/stream")
      expect(res.status).toBe(200)
      const reader = (res.body as ReadableStream<Uint8Array>).getReader()
      open.push(() => reader.cancel())
    }
    expect((await request(alice, "/api/notifications/stream")).status).toBe(429)
  })
})
