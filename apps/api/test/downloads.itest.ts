import { beforeEach, describe, expect, test } from "bun:test"
import { generateCertificateCode } from "@sahihi/core"
import { issueSigningLink, prisma } from "@sahihi/db"
import { keys, putObject } from "@sahihi/infra"
import { createSender, minimalPdf, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let bob: Sender
let envelopeId: string
let recipientId: string
const TITLE = "Mkataba wa Kodi – Nyéri"
const signedBytes = minimalPdf(2)
const certBytes = minimalPdf(1)

/** A COMPLETED envelope; `finalized` adds the stored signed PDF + certificate (what finalize does). */
async function seedCompleted(finalized: boolean) {
  const { document } = await uploadDocument(alice)
  const envelope = await prisma.envelope.create({
    data: {
      organizationId: alice.organizationId,
      documents: { create: { documentId: document.id } },
      createdById: alice.userId,
      title: TITLE,
      status: "COMPLETED",
      completedAt: new Date(),
      recipients: {
        create: [
          {
            name: "Wanjiku",
            email: "wanjiku@example.test",
            status: "SIGNED",
            signedAt: new Date(),
          },
        ],
      },
    },
    include: { recipients: true, documents: true },
  })
  envelopeId = envelope.id
  recipientId = envelope.recipients[0]?.id as string
  if (!finalized) return
  const signedKey = keys.signedDocument(
    alice.organizationId,
    envelope.id,
    envelope.documents[0]?.id as string,
  )
  const certKey = keys.certificate(alice.organizationId, envelope.id)
  await putObject(signedKey, signedBytes, "application/pdf")
  await putObject(certKey, certBytes, "application/pdf")
  await prisma.envelopeDocument.updateMany({
    where: { envelopeId: envelope.id },
    data: { signedS3Key: signedKey, signedSha256: "5".repeat(64) },
  })
  await prisma.certificate.create({
    data: {
      envelopeId: envelope.id,
      code: generateCertificateCode(),
      s3Key: certKey,
      sha256: "c".repeat(64),
      provider: "INTERNAL",
    },
  })
}

/** Raw token for the recipient (what the completion email carries). */
const signerToken = () =>
  prisma.$transaction(
    async (tx) =>
      (await issueSigningLink(tx, recipientId, new Date(Date.now() + 86_400_000))).token,
  )

async function expectDownload(url: string, bytes: Uint8Array, kind: "signed" | "certificate") {
  const res = await fetch(url)
  expect(res.status).toBe(200)
  const cd = res.headers.get("content-disposition") ?? ""
  expect(cd.startsWith("attachment;")).toBe(true)
  // Exact UTF-8 name for modern browsers, readable ASCII fallback for old ones.
  const star = decodeURIComponent(cd.split("filename*=UTF-8''")[1] ?? "")
  expect(star).toBe(`Mkataba wa Kodi Nyéri (${kind}).pdf`)
  expect(cd).toContain(`filename="Mkataba wa Kodi Nyeri (${kind}).pdf"`)
  expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true)
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  bob = await createSender("bob")
})

describe("GET /api/envelopes/:id/downloads (sender)", () => {
  test("409 while the signed PDF is still being produced", async () => {
    await seedCompleted(false)
    const res = await request(alice, `/api/envelopes/${envelopeId}/downloads`)
    expect(res.status).toBe(409)
  })

  test("downloads both files as attachments with UTF-8 file names", async () => {
    await seedCompleted(true)
    const res = await request(alice, `/api/envelopes/${envelopeId}/downloads`)
    expect(res.status).toBe(200)
    const { signed, certificate } = (await res.json()) as { signed: string; certificate: string }
    await expectDownload(signed, signedBytes, "signed")
    await expectDownload(certificate, certBytes, "certificate")
  })

  test("another organization gets 404", async () => {
    await seedCompleted(true)
    expect((await request(bob, `/api/envelopes/${envelopeId}/downloads`)).status).toBe(404)
  })
})

describe("GET /api/sign/:token/downloads (signer)", () => {
  test("a completed envelope's link downloads both files", async () => {
    await seedCompleted(true)
    const token = await signerToken()
    const res = await request(null, `/api/sign/${token}/downloads`)
    expect(res.status).toBe(200)
    const { signed } = (await res.json()) as { signed: string }
    await expectDownload(signed, signedBytes, "signed")
  })

  test("not available before finalization", async () => {
    await seedCompleted(false)
    const token = await signerToken()
    const res = await request(null, `/api/sign/${token}/downloads`)
    expect(res.status).toBe(409)
  })
})
