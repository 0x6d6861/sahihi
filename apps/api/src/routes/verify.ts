import { prisma } from "@sahihi/db"
import { Hono } from "hono"
import { z } from "zod"
import { parseJson } from "../lib/http"
import { rateLimit } from "../middleware/rate-limit"

/**
 * Public verification. Anyone holding a certificate code or a PDF can check
 * it. The browser hashes the file locally and sends ONLY the SHA-256.
 */
const HashSchema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/) })

const mask = (e: string) =>
  e.replace(
    /^(.)(.*)(@.*)$/,
    (_, a, b: string, d) => `${a}${"•".repeat(Math.min(b.length, 6))}${d}`,
  )

export const verify = new Hono()
  .use(rateLimit({ bucket: "verify", limit: 30, windowSec: 60 }))

  .get("/:code", async (c) => {
    const cert = await prisma.certificate.findUnique({
      where: { code: c.req.param("code").toUpperCase() },
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
    const { sha256 } = await parseJson(c, HashSchema)
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
