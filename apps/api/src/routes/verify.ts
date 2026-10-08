import { normalizeCertificateCode, VerifyHashSchema } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { Hono } from "hono"
import { parseJson } from "../lib/http"
import { rateLimit } from "../middleware/rate-limit"

/**
 * Public verification. Anyone holding a certificate code or a PDF can check
 * it. The browser hashes the file locally and sends ONLY the SHA-256.
 */
const mask = (e: string) =>
  e.replace(
    /^(.)(.*)(@.*)$/,
    (_, a, b: string, d) => `${a}${"•".repeat(Math.min(b.length, 6))}${d}`,
  )

export const verify = new Hono()
  .use(rateLimit({ bucket: "verify", limit: 30, windowSec: 60 }))

  .get("/:code", async (c) => {
    // Malformed codes can't exist; answer without a DB lookup.
    const code = normalizeCertificateCode(c.req.param("code"))
    if (!code) return c.json({ valid: false }, 404)
    const cert = await prisma.certificate.findUnique({
      where: { code },
      include: {
        envelope: {
          select: {
            id: true,
            title: true,
            completedAt: true,
            organization: { select: { name: true } },
            documents: {
              orderBy: { order: "asc" },
              select: {
                signedSha256: true,
                document: { select: { name: true, sha256: true, pageCount: true } },
              },
            },
            attachments: {
              where: { status: "READY" },
              orderBy: { order: "asc" },
              select: { name: true, sha256: true },
            },
            recipients: {
              where: { role: { not: "VIEWER" } },
              select: { name: true, email: true, signedAt: true, verification: true },
              orderBy: { order: "asc" },
            },
          },
        },
      },
    })
    if (!cert) return c.json({ valid: false }, 404)
    const e = cert.envelope
    return c.json({
      valid: true,
      certificate: {
        code: cert.code,
        issuedAt: cert.issuedAt,
        provider: cert.provider,
        sha256: cert.sha256,
      },
      envelope: {
        id: e.id,
        title: e.title,
        organization: e.organization.name,
        completedAt: e.completedAt,
        // Every document with its original and signed hash, in signing order (ADR 0037).
        documents: e.documents.map((d) => ({
          name: d.document.name,
          pageCount: d.document.pageCount,
          originalSha256: d.document.sha256,
          signedSha256: d.signedSha256,
        })),
        attachments: e.attachments,
        // The first document's, for clients built before multi-document envelopes.
        originalSha256: e.documents[0]?.document.sha256 ?? null,
        signedSha256: e.documents[0]?.signedSha256 ?? null,
        pageCount: e.documents.reduce((n, d) => n + (d.document.pageCount ?? 0), 0),
        signers: e.recipients.map((r) => ({ ...r, email: mask(r.email) })),
      },
    })
  })

  .post("/hash", async (c) => {
    // Only signed documents and certificates match, never originals: this endpoint must not reveal
    // whether some unsigned file was ever uploaded to Sahihi.
    const { sha256 } = await parseJson(c, VerifyHashSchema)
    const [signed, cert] = await Promise.all([
      prisma.envelopeDocument.findFirst({
        where: { signedSha256: sha256 },
        select: { envelope: { select: { certificate: { select: { code: true } } } } },
      }),
      prisma.certificate.findFirst({ where: { sha256 }, select: { code: true } }),
    ])
    if (signed?.envelope.certificate)
      return c.json({ match: "signed_document", code: signed.envelope.certificate.code })
    if (cert) return c.json({ match: "certificate", code: cert.code })
    return c.json({ match: null })
  })
