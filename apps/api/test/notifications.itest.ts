import { beforeEach, describe, expect, test } from "bun:test"
import { CONSENT_VERSION } from "@sahihi/core"
import { notifyUsers, prisma } from "@sahihi/db"
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
          documentId: document.id,
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
      const cursor = await request(s, `/api/notifications?cursor=${ids[0]}`)
      expect(cursor.status).toBe(400)
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
