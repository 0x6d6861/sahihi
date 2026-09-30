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
            signedSha256: true,
            organization: { select: { name: true } },
            document: { select: { sha256: true, pageCount: true } },
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
        originalSha256: e.document.sha256,
        signedSha256: e.signedSha256,
        pageCount: e.document.pageCount,
        signers: e.recipients.map((r) => ({ ...r, email: mask(r.email) })),
      },
    })
  })

  .post("/hash", async (c) => {
    // Only signed documents and certificates match, never originals: this endpoint must not reveal
    // whether some unsigned file was ever uploaded to Sahihi.
    const { sha256 } = await parseJson(c, VerifyHashSchema)
    const [signed, cert] = await Promise.all([
      prisma.envelope.findFirst({
        where: { signedSha256: sha256 },
        select: { certificate: { select: { code: true } } },
      }),
      prisma.certificate.findFirst({ where: { sha256 }, select: { code: true } }),
    ])
    if (signed?.certificate)
      return c.json({ match: "signed_document", code: signed.certificate.code })
    if (cert) return c.json({ match: "certificate", code: cert.code })
    return c.json({ match: null })
  })
