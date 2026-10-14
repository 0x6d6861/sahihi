import { beforeEach, describe, expect, test } from "bun:test"
import { CONSENT_VERSION, downloadFileName, sha256Hex } from "@sahihi/core"
import { prisma, storageConnectionConfigSelect } from "@sahihi/db"
import { customerBucket, getQueues, keys, platformStorage } from "@sahihi/infra"
import { finalizeEnvelope } from "../../worker/src/jobs/finalize"
import { sweepAbandonedUploads } from "../../worker/src/jobs/maintenance"
import { deliverToStorage, migrateStorage } from "../../worker/src/jobs/storage"
import { renderDocumentThumbnail } from "../../worker/src/jobs/thumbnails"
import {
  createSender,
  joinOrganization,
  minimalPdf,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

/**
 * Bring your own storage (docs/storage.md, ADR 0051). The local MinIO's second bucket,
 * `sahihi-customer`, plays the customer's; every test uses its own prefix in it.
 */

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

const bucketFields = () => ({
  provider: "S3_COMPATIBLE",
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  bucket: "sahihi-customer",
  prefix: `t-${crypto.randomUUID().slice(0, 8)}`,
  auth: "ACCESS_KEYS",
  accessKeyId: "sahihi",
  secretAccessKey: "sahihi-secret",
})

type ConnectionView = { id: string; status: string; primaryState: string | null; prefix: string }

async function connect(who: Sender, purpose: "SYNC" | "PRIMARY", extra: object = {}) {
  const res = await request(who, "/api/storage/connections", {
    method: "POST",
    json: { purpose, name: `${purpose} bucket`, ...bucketFields(), ...extra },
  })
  return {
    res,
    body: (await res.json()) as {
      connection: ConnectionView & Record<string, unknown>
      test: { ok: boolean; message?: string }
    },
  }
}

/** The connection's bucket as infra sees it, for checking what's really there. */
async function bucketOf(connectionId: string) {
  const row = await prisma.storageConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: storageConnectionConfigSelect,
  })
  return customerBucket(row)
}

/** One signer, one signature, sent, signed and finalized. Returns the envelope id. */
async function completedEnvelope(who: Sender, title = "Lease 2026") {
  const { document } = await uploadDocument(who, minimalPdf(1), "lease.pdf")
  const created = await request(who, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title },
  })
  const id = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const email = `signer-${crypto.randomUUID().slice(0, 6)}@example.test`
  const put = await request(who, `/api/envelopes/${id}/recipients`, {
    method: "PUT",
    json: { recipients: [{ name: "Amina Hassan", email }] },
  })
  const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  const fieldsRes = await request(who, `/api/envelopes/${id}/fields`, {
    method: "PUT",
    json: {
      fields: [
        {
          recipientId: r?.id,
          type: "SIGNATURE",
          page: 1,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.05,
        },
      ],
    },
  })
  const fields = ((await fieldsRes.json()) as { fields: { id: string }[] }).fields
  expect((await request(who, `/api/envelopes/${id}/send`, { method: "POST" })).status).toBe(200)
  const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed"])
  const token = jobs.find((j) => j.name === "envelope.invite" && j.data.recipientId === r?.id)?.data
    .token as string
  const submitted = await request(null, `/api/sign/${token}/submit`, {
    method: "POST",
    json: {
      consent: true,
      consentVersion: CONSENT_VERSION,
      values: fields.map((f) => ({ kind: "image", fieldId: f.id, dataUrl: PNG })),
    },
  })
  expect(submitted.status).toBe(200)
  expect(await finalizeEnvelope(id)).toHaveProperty("code")
  return id
}

beforeEach(resetDb)

describe("connections", () => {
  test("plans: Free and Starter have none, Business one sync destination, Enterprise primary", async () => {
    const free = await createSender("free", { plan: "free" })
    expect((await connect(free, "SYNC")).res.status).toBe(402)

    const business = await createSender("business", { plan: "business" })
    expect((await connect(business, "SYNC")).res.status).toBe(201)
    expect((await connect(business, "SYNC")).res.status).toBe(402)
    const primary = await connect(business, "PRIMARY")
    expect(primary.res.status).toBe(402)
    expect((primary.body as unknown as { message: string }).message).toContain("Enterprise")

    const enterprise = await createSender("enterprise")
    expect((await connect(enterprise, "PRIMARY")).res.status).toBe(201)
    expect((await connect(enterprise, "PRIMARY")).res.status).toBe(402)
  })

  test("owners and admins only", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const member = await joinOrganization(owner, "member", "member")
    expect((await request(member, "/api/storage")).status).toBe(403)
    expect((await connect(member, "SYNC")).res.status).toBe(403)
  })

  test("connecting tests the bucket; secrets are never returned; the probe is never deleted", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const { res, body } = await connect(owner, "SYNC")
    expect(res.status).toBe(201)
    expect(body.test).toEqual({ ok: true })
    expect(body.connection.status).toBe("ACTIVE")
    const text = JSON.stringify(body)
    expect(text).not.toContain("sahihi-secret")
    expect(text).not.toContain("secretEncrypted")
    expect(text).not.toContain("accessKeyId")
    expect(
      await (await bucketOf(body.connection.id)).head(".sahihi/connection-check"),
    ).not.toBeNull()

    const overview = (await (await request(owner, "/api/storage")).json()) as {
      plan: { ownStorage: string }
      connections: { id: string }[]
    }
    expect(overview.plan.ownStorage).toBe("sync")
    expect(overview.connections.map((c) => c.id)).toEqual([body.connection.id])
  })

  test("a failing test still saves the connection, as PENDING, with the reason", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const { res, body } = await connect(owner, "SYNC", { secretAccessKey: "wrong-secret-123" })
    expect(res.status).toBe(201)
    expect(body.test.ok).toBe(false)
    expect(body.test.message).toContain("secret access key")
    expect(body.connection.status).toBe("PENDING")

    // Rotating to the right key re-tests it.
    const fixed = await request(owner, `/api/storage/connections/${body.connection.id}`, {
      method: "PATCH",
      json: { accessKeyId: "sahihi", secretAccessKey: "sahihi-secret" },
    })
    const after = (await fixed.json()) as { connection: { status: string }; test: { ok: boolean } }
    expect(after).toMatchObject({ connection: { status: "ACTIVE" }, test: { ok: true } })
  })

  test("endpoints must be valid; bucket names follow S3 rules", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const bad = await connect(owner, "SYNC", { endpoint: "ftp://example.com" })
    expect(bad.res.status).toBe(400)
    expect((await connect(owner, "SYNC", { bucket: "Not_A_Bucket" })).res.status).toBe(400)
  })
})

describe("sync (Business)", () => {
  test("a completed envelope's files are copied, once, into a folder of its own", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const { body } = await connect(owner, "SYNC")
    const envelopeId = await completedEnvelope(owner, "Lease: Unit 4")

    const delivery = await prisma.storageDelivery.findUniqueOrThrow({
      where: { connectionId_envelopeId: { connectionId: body.connection.id, envelopeId } },
    })
    const queued = await getQueues().storage.raw.getJob(`std-${delivery.id}`)
    expect(queued?.data).toEqual({ deliveryId: delivery.id })

    const result = await deliverToStorage(delivery.id, { isFinal: false })
    expect(result).toMatchObject({ delivered: 3 })
    const done = await prisma.storageDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    expect(done.status).toBe("SUCCEEDED")
    const year = String(new Date().getUTCFullYear())
    expect(done.path).toStartWith(`${year}/`)
    expect(done.path).toEndWith(`Lease- Unit 4 (${envelopeId.slice(-8)})`)

    const bucket = await bucketOf(body.connection.id)
    const signed = await bucket.get(`${done.path}/${downloadFileName("Lease: Unit 4", "signed")}`)
    const row = await prisma.envelopeDocument.findFirstOrThrow({ where: { envelopeId } })
    expect(await sha256Hex(signed)).toBe(row.signedSha256 as string)
    expect(
      await bucket.head(`${done.path}/${downloadFileName("Lease: Unit 4", "certificate")}`),
    ).not.toBeNull()
    const audit = JSON.parse(
      new TextDecoder().decode(await bucket.get(`${done.path}/audit-trail.json`)),
    )
    expect(audit.verification.valid).toBe(true)

    // A retry finds the same bytes already there and succeeds without writing.
    await prisma.storageDelivery.update({ where: { id: delivery.id }, data: { status: "PENDING" } })
    expect(await deliverToStorage(delivery.id, { isFinal: false })).toMatchObject({ delivered: 3 })
  })

  test("different bytes already at a path fail the delivery, mark the destination and tell admins", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const { body } = await connect(owner, "SYNC", { folderTemplate: "fixed/{id}" })
    await request(owner, "/api/webhooks", {
      method: "POST",
      json: { url: "http://localhost:9/hook", events: ["storage.delivery_failed"] },
    })
    const envelopeId = await completedEnvelope(owner, "Clash")
    const bucket = await bucketOf(body.connection.id)
    await bucket.put(`fixed/${envelopeId.slice(-8)}/Clash (signed).pdf`, new Uint8Array([1]), "x/y")

    const delivery = await prisma.storageDelivery.findFirstOrThrow({ where: { envelopeId } })
    await expect(deliverToStorage(delivery.id, { isFinal: true })).rejects.toThrow("write-once")
    expect(
      await prisma.storageDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).toMatchObject({ status: "FAILED", lastError: expect.stringContaining("write-once") })
    const conn = await prisma.storageConnection.findUniqueOrThrow({
      where: { id: body.connection.id },
    })
    expect(conn.status).toBe("FAILING")
    expect(
      await prisma.notification.count({
        where: { organizationId: owner.organizationId, type: "storage.failing" },
      }),
    ).toBe(1)
    expect(
      await prisma.webhookDelivery.count({
        where: { organizationId: owner.organizationId, type: "storage.delivery_failed" },
      }),
    ).toBe(1)
    // The file that was there is untouched.
    expect([...(await bucket.get(`fixed/${envelopeId.slice(-8)}/Clash (signed).pdf`))]).toEqual([1])
  })

  test("a downgrade pauses sync: deliveries fail as paused, none are queued", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const { body } = await connect(owner, "SYNC")
    const first = await completedEnvelope(owner, "Before")
    await prisma.subscription.update({
      where: { organizationId: owner.organizationId },
      data: { plan: "starter" },
    })
    const delivery = await prisma.storageDelivery.findFirstOrThrow({
      where: { envelopeId: first },
    })
    await expect(deliverToStorage(delivery.id, { isFinal: false })).rejects.toThrow("Paused")
    const after = await completedEnvelope(owner, "After")
    expect(await prisma.storageDelivery.count({ where: { envelopeId: after } })).toBe(0)
    expect(body.connection.status).toBe("ACTIVE")
  })

  test("backfill queues earlier completed envelopes, once", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const earlier = await completedEnvelope(owner, "Earlier")
    const { body } = await connect(owner, "SYNC")
    const path = `/api/storage/connections/${body.connection.id}/backfill`
    const res = await request(owner, path, { method: "POST", json: { days: 30 } })
    expect(await res.json()).toEqual({ queued: 1 })
    expect(await prisma.storageDelivery.count({ where: { envelopeId: earlier } })).toBe(1)
    const again = await request(owner, path, { method: "POST", json: { days: 30 } })
    expect(await again.json()).toEqual({ queued: 0 })
  })
})

describe("primary storage (Enterprise)", () => {
  async function activate(owner: Sender) {
    const { body } = await connect(owner, "PRIMARY")
    const id = body.connection.id
    const res = await request(owner, `/api/storage/connections/${id}/activate`, { method: "POST" })
    expect(res.status).toBe(202)
    expect(await migrateStorage(id)).toMatchObject({ direction: "in" })
    return { id, bucket: await bucketOf(id) }
  }

  test("moving in copies every file and removes Sahihi's copies", async () => {
    const owner = await createSender("owner")
    const { document } = await uploadDocument(owner, minimalPdf(2), "before.pdf")
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    const { id, bucket } = await activate(owner)

    expect(await bucket.head(row.s3Key)).not.toBeNull()
    expect(await platformStorage().head(row.s3Key)).toBeNull()
    const conn = await prisma.storageConnection.findUniqueOrThrow({ where: { id } })
    expect(conn).toMatchObject({ primaryState: "ACTIVE", migrateTotal: 1, migratedCount: 1 })

    // The viewer gets a ticket on our own origin, never the bucket's address.
    const file = await request(owner, `/api/documents/${document.id}/file`)
    const { url } = (await file.json()) as { url: string }
    expect(url).toStartWith("http://localhost:3000/api/storage/objects/")
    const served = await request(null, new URL(url).pathname)
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toBe("application/pdf")
    expect(await sha256Hex(new Uint8Array(await served.arrayBuffer()))).toBe(row.sha256 as string)
  })

  test("uploads wait in Sahihi's bucket until validated; rejected ones never reach the customer", async () => {
    const owner = await createSender("owner")
    const { bucket } = await activate(owner)

    const { document } = await uploadDocument(owner, minimalPdf(1), "after.pdf")
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    expect(row.status).toBe("READY")
    expect(await bucket.head(row.s3Key)).not.toBeNull()
    expect(await platformStorage().head(row.s3Key)).toBeNull()
    expect(await platformStorage().head(keys.staging(row.s3Key))).toBeNull()

    const junk = await uploadDocument(owner, new TextEncoder().encode("not a pdf"), "junk.pdf")
    expect(junk.status).toBe(422)
    const junkRow = await prisma.document.findUniqueOrThrow({ where: { id: junk.document.id } })
    expect(await bucket.head(junkRow.s3Key)).toBeNull()
    expect(await platformStorage().head(keys.staging(junkRow.s3Key))).toBeNull()

    // Abandoned: the PUT landed in staging, nobody completed it. The sweep clears staging only.
    const created = await request(owner, "/api/documents/uploads", {
      method: "POST",
      json: { name: "gone.pdf", sizeBytes: 9, contentType: "application/pdf" },
    })
    const pending = (await created.json()) as { document: { id: string }; uploadUrl: string }
    await fetch(pending.uploadUrl, { method: "PUT", body: "%PDF-1.7\n" })
    const goneKey = (
      await prisma.document.findUniqueOrThrow({ where: { id: pending.document.id } })
    ).s3Key
    expect(await platformStorage().head(keys.staging(goneKey))).not.toBeNull()
    await sweepAbandonedUploads(new Date(Date.now() + 2 * 3600 * 1000))
    expect(await platformStorage().head(keys.staging(goneKey))).toBeNull()
    expect(await bucket.head(goneKey)).toBeNull()
  })

  test("signing, thumbnails and certificates are written to the customer's bucket", async () => {
    const owner = await createSender("owner")
    const { bucket } = await activate(owner)
    const envelopeId = await completedEnvelope(owner)
    const signed = await prisma.envelopeDocument.findFirstOrThrow({ where: { envelopeId } })
    const certificate = await prisma.certificate.findUniqueOrThrow({ where: { envelopeId } })
    for (const key of [signed.signedS3Key as string, certificate.s3Key]) {
      expect(await bucket.head(key)).not.toBeNull()
      expect(await platformStorage().head(key)).toBeNull()
    }

    const doc = await prisma.document.findFirstOrThrow({
      where: { organizationId: owner.organizationId },
    })
    expect(await renderDocumentThumbnail(doc.id)).toMatchObject({ rendered: true })
    const thumb = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(await bucket.head(thumb.thumbnailKey as string)).not.toBeNull()

    const downloads = await request(owner, `/api/envelopes/${envelopeId}/downloads`)
    const { certificate: certUrl } = (await downloads.json()) as { certificate: string }
    const served = await request(null, new URL(certUrl).pathname)
    expect(served.headers.get("content-disposition")).toStartWith("attachment;")
    expect(await sha256Hex(new Uint8Array(await served.arrayBuffer()))).toBe(certificate.sha256)
  })

  test("deleting releases the file: it stays in the bucket, logged, tagged and announced", async () => {
    const owner = await createSender("owner")
    await request(owner, "/api/webhooks", {
      method: "POST",
      json: { url: "http://localhost:9/hook", events: ["storage.objects_released"] },
    })
    const { bucket } = await activate(owner)
    const { document } = await uploadDocument(owner, minimalPdf(1), "draft.pdf")
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    expect(
      (await request(owner, `/api/documents/${document.id}`, { method: "DELETE" })).status,
    ).toBe(204)
    expect(await bucket.head(row.s3Key)).not.toBeNull()

    const releases = (await (await request(owner, "/api/storage/releases")).json()) as {
      items: { key: string; reason: string }[]
    }
    expect(releases.items).toEqual([
      expect.objectContaining({ key: bucket.fullKey(row.s3Key), reason: "DELETED" }),
    ])
    const csv = await (await request(owner, "/api/storage/releases.csv")).text()
    expect(csv.split("\n")[1]).toStartWith(`${bucket.fullKey(row.s3Key)},false,DELETED,`)
    expect(
      await prisma.webhookDelivery.count({
        where: { organizationId: owner.organizationId, type: "storage.objects_released" },
      }),
    ).toBe(1)
  })

  test("disconnecting moves files back; the bucket keeps every file", async () => {
    const owner = await createSender("owner")
    const { document } = await uploadDocument(owner, minimalPdf(1), "keep.pdf")
    const row = await prisma.document.findUniqueOrThrow({ where: { id: document.id } })
    const { id, bucket } = await activate(owner)

    const res = await request(owner, `/api/storage/connections/${id}`, { method: "DELETE" })
    expect(res.status).toBe(202)
    // While files move out, new uploads go to Sahihi's bucket and reads find both.
    const during = await uploadDocument(owner, minimalPdf(1), "during.pdf")
    const duringRow = await prisma.document.findUniqueOrThrow({ where: { id: during.document.id } })
    expect(await platformStorage().head(duringRow.s3Key)).not.toBeNull()

    expect(await migrateStorage(id)).toMatchObject({ direction: "out" })
    expect(await prisma.storageConnection.findUnique({ where: { id } })).toBeNull()
    expect(await platformStorage().head(row.s3Key)).not.toBeNull()
    expect(await bucket.head(row.s3Key)).not.toBeNull()
    const file = (await (await request(owner, `/api/documents/${document.id}/file`)).json()) as {
      url: string
    }
    expect(file.url).not.toContain("/api/storage/objects/")
  })

  test("downgrading below Enterprise is refused while files are in the workspace's bucket", async () => {
    const owner = await createSender("owner")
    await activate(owner)
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: owner.organizationId } })
    const run = Bun.spawnSync(["bun", "packages/db/scripts/set-plan.ts", org.slug, "business"], {
      cwd: `${import.meta.dir}/../../..`,
      env: process.env,
      stderr: "pipe",
    })
    expect(run.exitCode).toBe(1)
    expect(run.stderr.toString()).toContain("keeps its files in its own storage")
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: owner.organizationId },
    })
    expect(sub.plan).toBe("enterprise")
  })
})

describe("file tickets", () => {
  test("forged, expired or foreign tickets are 404", async () => {
    for (const ticket of ["nope", "a.b", `${btoa("{}")}.x`]) {
      const res = await request(null, `/api/storage/objects/${encodeURIComponent(ticket)}`)
      expect(res.status).toBe(404)
    }
  })
})
