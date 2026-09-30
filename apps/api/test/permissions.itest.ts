import { beforeEach, describe, expect, test } from "bun:test"
import { auth } from "../src/auth"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// docs/auth.md → Roles. alice owns the org, carol is an admin, bob is a member.
let alice: Sender
let carol: Sender
let bob: Sender

/** A draft envelope by `sender` with one signer and one signature field (ready to send). */
async function draftEnvelope(sender: Sender) {
  const { document } = await uploadDocument(sender)
  const created = await request(sender, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "Lease" },
  })
  expect(created.status).toBe(201)
  const { envelope } = (await created.json()) as { envelope: { id: string } }
  const put = await request(sender, `/api/envelopes/${envelope.id}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Signer", email: "signer@example.test" }] },
  })
  const [recipient] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  if (!recipient) throw new Error("no recipient")
  const fields = await request(sender, `/api/envelopes/${envelope.id}/fields`, {
    method: "PUT",
    json: {
      fields: [
        {
          recipientId: recipient.id,
          type: "SIGNATURE",
          page: 1,
          x: 0.1,
          y: 0.1,
          width: 0.3,
          height: 0.06,
        },
      ],
    },
  })
  expect(fields.status).toBe(200)
  return { envelopeId: envelope.id, documentId: document.id, recipientId: recipient.id }
}

const send = (s: Sender, id: string) => request(s, `/api/envelopes/${id}/send`, { method: "POST" })
const voidIt = (s: Sender, id: string) =>
  request(s, `/api/envelopes/${id}/void`, { method: "POST", json: { reason: "Wrong version" } })
const detail = async (s: Sender, id: string) => {
  const res = await request(s, `/api/envelopes/${id}`)
  return { status: res.status, body: (await res.json()) as { permissions: { manage: boolean } } }
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  carol = await joinOrganization(alice, "carol", "admin")
  bob = await joinOrganization(alice, "bob", "member")
})

describe("envelopes: members change only their own", () => {
  test("a member can read a colleague's envelope but not edit, send, remind or void it", async () => {
    const { envelopeId, recipientId } = await draftEnvelope(alice)

    const seen = await detail(bob, envelopeId)
    expect(seen.status).toBe(200)
    expect(seen.body.permissions.manage).toBe(false)

    const edit = await request(bob, `/api/envelopes/${envelopeId}/recipients`, {
      method: "PUT",
      json: { recipients: [{ name: "Mallory", email: "mallory@example.test" }] },
    })
    expect(edit.status).toBe(403)
    expect(await edit.json()).toMatchObject({ error: "forbidden" })
    const fields = await request(bob, `/api/envelopes/${envelopeId}/fields`, {
      method: "PUT",
      json: { fields: [] },
    })
    expect(fields.status).toBe(403)
    expect((await send(bob, envelopeId)).status).toBe(403)

    expect((await send(alice, envelopeId)).status).toBe(200)
    const remind = await request(
      bob,
      `/api/envelopes/${envelopeId}/recipients/${recipientId}/remind`,
      { method: "POST" },
    )
    expect(remind.status).toBe(403)
    expect((await voidIt(bob, envelopeId)).status).toBe(403)

    // Nothing changed
    const after = await request(alice, `/api/envelopes/${envelopeId}`)
    const { envelope } = (await after.json()) as {
      envelope: { status: string; recipients: { email: string }[] }
    }
    expect(envelope.status).toBe("SENT")
    expect(envelope.recipients.map((r) => r.email)).toEqual(["signer@example.test"])
  })

  test("a member manages envelopes they created", async () => {
    const { envelopeId } = await draftEnvelope(bob)
    expect((await detail(bob, envelopeId)).body.permissions.manage).toBe(true)
    expect((await send(bob, envelopeId)).status).toBe(200)
    expect((await voidIt(bob, envelopeId)).status).toBe(200)
  })

  test("admin and owner manage any envelope in the org", async () => {
    const byBob = await draftEnvelope(bob)
    expect((await detail(carol, byBob.envelopeId)).body.permissions.manage).toBe(true)
    expect((await send(carol, byBob.envelopeId)).status).toBe(200)
    expect((await voidIt(alice, byBob.envelopeId)).status).toBe(200)

    const byAlice = await draftEnvelope(alice)
    expect((await send(carol, byAlice.envelopeId)).status).toBe(200)
    expect((await voidIt(carol, byAlice.envelopeId)).status).toBe(200)
  })

  test("roles never cross organizations (404, not 403)", async () => {
    const mallory = await createSender("mallory")
    const { envelopeId } = await draftEnvelope(alice)
    expect((await voidIt(mallory, envelopeId)).status).toBe(404)
    expect((await request(mallory, `/api/envelopes/${envelopeId}`)).status).toBe(404)
  })
})

describe("documents: members delete only their own", () => {
  test("member vs uploader vs admin", async () => {
    const { document: alicesDoc } = await uploadDocument(alice)
    const { document: bobsDoc } = await uploadDocument(bob)

    const seen = await request(bob, `/api/documents/${alicesDoc.id}`)
    expect(((await seen.json()) as { permissions: { delete: boolean } }).permissions.delete).toBe(
      false,
    )
    expect(
      (await request(bob, `/api/documents/${alicesDoc.id}`, { method: "DELETE" })).status,
    ).toBe(403)
    expect((await request(bob, `/api/documents/${bobsDoc.id}`, { method: "DELETE" })).status).toBe(
      204,
    )
    expect(
      (await request(carol, `/api/documents/${alicesDoc.id}`, { method: "DELETE" })).status,
    ).toBe(204)
  })
})

describe("better-auth uses the same roles", () => {
  const invite = (s: Sender, email: string) =>
    auth.api.createInvitation({
      body: { email, role: "member", organizationId: alice.organizationId },
      headers: new Headers({ cookie: s.cookie }),
    })

  test("owner and admin invite members; a member can't", async () => {
    await expect(invite(alice, "new1@example.test")).resolves.toBeDefined()
    await expect(invite(carol, "new2@example.test")).resolves.toBeDefined()
    await expect(invite(bob, "new3@example.test")).rejects.toThrow()
  })

  test("only the owner can delete the organization", async () => {
    const del = (s: Sender) =>
      auth.api.deleteOrganization({
        body: { organizationId: alice.organizationId },
        headers: new Headers({ cookie: s.cookie }),
      })
    await expect(del(bob)).rejects.toThrow()
    await expect(del(carol)).rejects.toThrow()
  })
})
