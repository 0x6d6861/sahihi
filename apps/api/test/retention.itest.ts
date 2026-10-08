import { beforeEach, describe, expect, test } from "bun:test"
import { generateCertificateCode } from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { getObjectBytes, getQueues, headObject, keys, putObject } from "@sahihi/infra"
import { unzipSync } from "fflate"
import {
  buildExport,
  cleanupExports,
  purgeEnvelope,
  purgeOrganizationStorage,
  retentionSweep,
} from "../../worker/src/jobs/retention"
import { auth } from "../src/auth"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// docs/data-retention.md. Worker functions are called directly (no worker process).

let alice: Sender
const pdf = new TextEncoder().encode("%PDF-1.7 signed")

/** A finalized COMPLETED envelope with files, a signature image, a text value and audit events. */
async function seedCompleted(completedAt = new Date()) {
  const { document } = await uploadDocument(alice)
  const envelope = await prisma.envelope.create({
    data: {
      organizationId: alice.organizationId,
      documents: { create: { documentId: document.id } },
      createdById: alice.userId,
      title: "Lease – Wanjiku Kamau",
      message: "Karibu",
      status: "COMPLETED",
      sentAt: completedAt,
      completedAt,
      recipients: {
        create: [
          {
            name: "Wanjiku Kamau",
            email: "wanjiku@example.test",
            phone: "+254712345678",
            status: "SIGNED",
            signedAt: completedAt,
            signedIp: "41.90.1.2",
            signedUserAgent: "Mozilla/5.0",
          },
        ],
      },
    },
    include: { recipients: true, documents: true },
  })
  const recipientId = envelope.recipients[0]?.id as string
  const envelopeDocumentId = envelope.documents[0]?.id as string
  const org = alice.organizationId
  const signedKey = keys.signedDocument(org, envelope.id, envelopeDocumentId)
  const imageKey = keys.fieldImage(org, envelope.id, "f1")
  await putObject(imageKey, new Uint8Array([137, 80, 78, 71]), "image/png")
  await putObject(signedKey, pdf, "application/pdf")
  await putObject(keys.certificate(org, envelope.id), pdf, "application/pdf")
  await prisma.field.createMany({
    data: [
      {
        envelopeId: envelope.id,
        envelopeDocumentId,
        recipientId,
        type: "SIGNATURE",
        page: 1,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.05,
        imageS3Key: imageKey,
      },
      {
        envelopeId: envelope.id,
        envelopeDocumentId,
        recipientId,
        type: "TEXT",
        page: 1,
        x: 0.1,
        y: 0.3,
        width: 0.2,
        height: 0.05,
        value: "ID 12345678",
      },
    ],
  })
  await prisma.envelopeDocument.update({
    where: { id: envelopeDocumentId },
    data: { signedS3Key: signedKey, signedSha256: "5".repeat(64) },
  })
  const cert = await prisma.certificate.create({
    data: {
      envelopeId: envelope.id,
      code: generateCertificateCode(),
      s3Key: keys.certificate(org, envelope.id),
      sha256: "c".repeat(64),
    },
  })
  await prisma.$transaction(async (tx) => {
    await appendAuditEvent(tx, { envelopeId: envelope.id, type: "envelope.created" })
    await appendAuditEvent(tx, { envelopeId: envelope.id, type: "recipient.signed", recipientId })
  })
  return {
    envelopeId: envelope.id,
    documentId: document.id,
    recipientId,
    imageKey,
    signedKey,
    code: cert.code,
  }
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
})

describe("purge", () => {
  test("deletes files and personal data, keeps the evidence and the audit chain", async () => {
    const s = await seedCompleted()
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        organizationId: alice.organizationId,
        createdById: alice.userId,
        url: "https://x.example",
        events: ["envelope.completed"],
        secretEncrypted: "v1.x.y",
        secretHint: "abcd",
      },
    })
    await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        organizationId: alice.organizationId,
        eventId: "evt_1",
        type: "envelope.completed",
        payload: {
          envelope: { id: s.envelopeId, recipients: [{ email: "wanjiku@example.test" }] },
        },
      },
    })

    expect(await purgeEnvelope(s.envelopeId, "manual")).toEqual({ purged: true })

    const e = await prisma.envelope.findUniqueOrThrow({
      where: { id: s.envelopeId },
      include: {
        recipients: true,
        fields: true,
        certificate: true,
        documents: true,
        auditEvents: { orderBy: { seq: "asc" } },
      },
    })
    // Files gone (signed, certificate, signature image, and the original: nothing else uses it).
    for (const key of [
      s.signedKey,
      keys.certificate(alice.organizationId, s.envelopeId),
      s.imageKey,
    ]) {
      expect({ key, exists: Boolean(await headObject(key)) }).toEqual({ key, exists: false })
    }
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: s.documentId } })
    expect(await headObject(doc.s3Key)).toBeNull()
    expect(doc.name).toBe("Deleted document")
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/) // hash kept

    // Personal data gone.
    expect(e).toMatchObject({ title: "Deleted envelope", message: null, bundleS3Key: null })
    expect(e.documents[0]?.signedS3Key).toBeNull()
    expect(e.recipients[0]).toMatchObject({
      name: "Deleted recipient",
      email: `deleted-${s.recipientId}@redacted.invalid`,
      phone: null,
      signedIp: null,
      signedUserAgent: null,
    })
    expect(e.fields.every((f) => f.value === null && f.imageS3Key === null)).toBe(true)
    expect(JSON.stringify(await prisma.webhookDelivery.findMany())).not.toContain("wanjiku")

    // Evidence kept.
    expect(e.status).toBe("COMPLETED")
    expect(e.documents[0]?.signedSha256).toBe("5".repeat(64))
    expect(e.certificate?.code).toBe(s.code)
    expect(e.recipients[0]?.signedAt).not.toBeNull()
    expect(e.auditEvents.map((a) => a.type)).toEqual([
      "envelope.created",
      "recipient.signed",
      "envelope.purged",
    ])
    const audit = (await (await request(alice, `/api/envelopes/${s.envelopeId}/audit`)).json()) as {
      verification: { valid: boolean }
    }
    expect(audit.verification.valid).toBe(true)

    // Downloads say the files are gone; purging again is a no-op.
    expect((await request(alice, `/api/envelopes/${s.envelopeId}/downloads`)).status).toBe(410)
    expect(await purgeEnvelope(s.envelopeId, "manual")).toEqual({ skipped: true })
  })

  test("an original still used by a template (or another envelope) is kept", async () => {
    const s = await seedCompleted()
    await prisma.template.create({
      data: {
        organizationId: alice.organizationId,
        documents: { create: { documentId: s.documentId } },
        createdById: alice.userId,
        name: "Lease",
      },
    })
    await purgeEnvelope(s.envelopeId, "manual")
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: s.documentId } })
    expect(await headObject(doc.s3Key)).not.toBeNull()
    expect(doc.deletedAt).toBeNull()
  })

  test("API: owners/admins only, closed envelopes only, queued for the worker", async () => {
    const s = await seedCompleted()
    const bob = await joinOrganization(alice, "bob", "member")
    expect(
      (await request(bob, `/api/envelopes/${s.envelopeId}/purge`, { method: "POST" })).status,
    ).toBe(403)
    const draft = await request(alice, "/api/envelopes", {
      method: "POST",
      json: { documentId: s.documentId, title: "Open" },
    })
    const { envelope } = (await draft.json()) as { envelope: { id: string } }
    expect(
      (await request(alice, `/api/envelopes/${envelope.id}/purge`, { method: "POST" })).status,
    ).toBe(409)
    expect(
      (await request(alice, `/api/envelopes/${s.envelopeId}/purge`, { method: "POST" })).status,
    ).toBe(202)
    expect(await getQueues().maintenance.raw.getJob(`purge-${s.envelopeId}`)).toBeTruthy()
  })
})

describe("retention sweep", () => {
  test("keep forever by default; with a period, only envelopes closed before the cutoff", async () => {
    const old = await seedCompleted(new Date(Date.now() - 4 * 365 * 24 * 3600 * 1000))
    const recent = await seedCompleted()
    expect(await retentionSweep()).toEqual({ queued: 0 })

    const set = await request(alice, "/api/data/settings", {
      method: "PUT",
      json: { retentionYears: 3 },
    })
    expect(set.status).toBe(200)
    expect(await retentionSweep()).toEqual({ queued: 1 })
    expect(await getQueues().maintenance.raw.getJob(`purge-${old.envelopeId}`)).toBeTruthy()
    expect(await getQueues().maintenance.raw.getJob(`purge-${recent.envelopeId}`)).toBeFalsy()
  })

  test("settings: owners/admins only, offered periods only", async () => {
    const bob = await joinOrganization(alice, "bob", "member")
    expect((await request(bob, "/api/data/settings")).status).toBe(403)
    expect(
      (await request(alice, "/api/data/settings", { method: "PUT", json: { retentionYears: 2 } }))
        .status,
    ).toBe(400)
    expect(await (await request(alice, "/api/data/settings")).json()).toEqual({
      retentionYears: null,
    })
  })
})

describe("export", () => {
  test("ZIP with envelope.json, audit.json and the PDFs; one at a time; downloadable, then cleaned up", async () => {
    const s = await seedCompleted()
    const res = await request(alice, "/api/data/exports", { method: "POST" })
    expect(res.status).toBe(202)
    const { export: x } = (await res.json()) as { export: { id: string } }
    expect((await request(alice, "/api/data/exports", { method: "POST" })).status).toBe(409)

    await buildExport(x.id)
    const row = await prisma.dataExport.findUniqueOrThrow({ where: { id: x.id } })
    expect(row).toMatchObject({ status: "READY", envelopeCount: 1 })
    const files = unzipSync(await getObjectBytes(row.s3Key as string))
    const names = Object.keys(files).sort()
    const folder = names.find((n) => n.endsWith("/envelope.json"))?.split("/")[0] as string
    expect(folder).toContain("Lease")
    expect(names).toEqual(
      [
        "README.txt",
        "manifest.json",
        ...[
          "audit.json",
          "certificate.pdf",
          "envelope.json",
          // One original and one signed copy per document, in signing order (ADR 0037).
          "documents/01-contract.pdf",
          "documents/01-contract (signed).pdf",
        ].map((f) => `${folder}/${f}`),
      ].sort(),
    )
    const meta = JSON.parse(new TextDecoder().decode(files[`${folder}/envelope.json`]))
    expect(meta.recipients[0].email).toBe("wanjiku@example.test")
    expect(meta.documents).toEqual([
      { name: "contract.pdf", sha256: expect.any(String), signedSha256: "5".repeat(64) },
    ])
    const audit = JSON.parse(new TextDecoder().decode(files[`${folder}/audit.json`]))
    expect(audit.verification.valid).toBe(true)
    expect(new TextDecoder().decode(files[`${folder}/documents/01-contract (signed).pdf`])).toBe(
      "%PDF-1.7 signed",
    )

    const dl = await request(alice, `/api/data/exports/${x.id}/download`)
    expect(dl.status).toBe(200)
    const list = await (await request(alice, "/api/data/exports")).text()
    expect(list).not.toContain("s3Key")

    await prisma.dataExport.update({
      where: { id: x.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await cleanupExports()).toEqual({ deleted: 1 })
    expect(await headObject(row.s3Key as string)).toBeNull()
    expect((await request(alice, `/api/data/exports/${x.id}/download`)).status).toBe(409)
    void s
  })
})

describe("deleting the workspace", () => {
  test("queues a storage wipe, which removes everything under org/<id>/", async () => {
    const s = await seedCompleted()
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: s.documentId } })
    await auth.api.deleteOrganization({
      body: { organizationId: alice.organizationId },
      headers: new Headers({ cookie: alice.cookie }),
    })
    expect(
      await getQueues().maintenance.raw.getJob(`purge-org-${alice.organizationId}`),
    ).toBeTruthy()
    const { deleted } = await purgeOrganizationStorage(alice.organizationId)
    expect(deleted).toBeGreaterThanOrEqual(4)
    expect(await headObject(doc.s3Key)).toBeNull()
    expect(await headObject(keys.signed(alice.organizationId, s.envelopeId))).toBeNull()
  })
})
