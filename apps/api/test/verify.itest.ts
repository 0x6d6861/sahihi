import { beforeEach, describe, expect, test } from "bun:test"
import { generateCertificateCode, sha256Hex } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createSender, request, resetDb, uploadDocument } from "./helpers"

// Public endpoints: no session. A completed envelope is seeded directly (finalize is covered by the
// worker; these tests are about lookup and what gets revealed).
let code: string
let originalSha: string
const signedSha = "5".repeat(64)
const certSha = "c".repeat(64)

beforeEach(async () => {
  await resetDb()
  const alice = await createSender("alice")
  const { document } = await uploadDocument(alice)
  originalSha = document.sha256 as string
  code = generateCertificateCode()
  const envelope = await prisma.envelope.create({
    data: {
      organizationId: alice.organizationId,
      documentId: document.id,
      createdById: alice.userId,
      title: "Lease",
      status: "COMPLETED",
      completedAt: new Date(),
      signedSha256: signedSha,
      signedS3Key: "org/x/envelopes/y/signed.pdf",
      recipients: {
        create: [
          {
            name: "Wanjiku Kamau",
            email: "wanjiku@example.test",
            status: "SIGNED",
            signedAt: new Date(),
          },
          { name: "Legal cc", email: "cc@example.test", role: "VIEWER" },
        ],
      },
    },
  })
  await prisma.certificate.create({
    data: {
      envelopeId: envelope.id,
      code,
      s3Key: "org/x/cert.pdf",
      sha256: certSha,
      provider: "INTERNAL",
    },
  })
})

const byHash = (sha256: string) =>
  request(null, "/api/verify/hash", { method: "POST", json: { sha256 } })

describe("POST /api/verify/hash", () => {
  test("the signed PDF's hash finds its certificate", async () => {
    expect(await (await byHash(signedSha)).json()).toEqual({ match: "signed_document", code })
  })

  test("the certificate PDF's own hash is recognised too", async () => {
    expect(await (await byHash(certSha)).json()).toEqual({ match: "certificate", code })
  })

  test("the unsigned original never matches (no 'was this uploaded?' oracle)", async () => {
    expect(await (await byHash(originalSha)).json()).toEqual({ match: null })
    expect(await (await byHash(await sha256Hex("anything"))).json()).toEqual({ match: null })
  })

  test("only a lowercase hex SHA-256 is accepted", async () => {
    for (const bad of ["A".repeat(64), "a".repeat(63), "not-a-hash"]) {
      expect((await byHash(bad)).status).toBe(400)
    }
  })
})

describe("GET /api/verify/:code", () => {
  test("any case or spacing works; emails are masked; viewers aren't listed", async () => {
    const res = await request(null, `/api/verify/${code.toLowerCase().replaceAll("-", " ")}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      valid: boolean
      envelope: { signedSha256: string; signers: { name: string; email: string }[] }
    }
    expect(body.valid).toBe(true)
    expect(body.envelope.signedSha256).toBe(signedSha)
    expect(body.envelope.signers).toEqual([
      expect.objectContaining({ name: "Wanjiku Kamau", email: "w••••••@example.test" }),
    ])
    expect(JSON.stringify(body)).not.toContain("wanjiku@example.test")
  })

  test("unknown and malformed codes are 404", async () => {
    expect((await request(null, "/api/verify/ZZZZ-ZZZZ-ZZZZ")).status).toBe(404)
    expect((await request(null, "/api/verify/not-a-code")).status).toBe(404)
  })
})
