import {
  normalizeSignerEmail,
  reminderAvailability,
  signerCanDownload,
  signerListGroup,
} from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { rotateRecipientLink } from "@sahihi/envelopes"
import { getQueues } from "@sahihi/infra"
import { type Context, Hono } from "hono"
import type { AppEnv } from "../lib/env"
import {
  downloadLinks,
  envelopeAttachmentsSelect,
  envelopeDocumentsSelect,
} from "../lib/envelope-documents"
import { clientMeta, notFound } from "../lib/http"
import { rateLimit } from "../middleware/rate-limit"
import { requireUser } from "../middleware/session"

/**
 * Optional signer accounts (ADR 0062, docs/security.md → Signer accounts): the envelopes sent to
 * the caller's **verified** email, across every workspace, as the recipient sees them. Never
 * scoped by the active workspace (a signer may have none); always scoped by the email instead.
 * An unverified email sees nothing, and nothing here returns a token or another recipient's data.
 */

/** The caller's verified email, or null: only a verified address may claim envelopes. */
function verifiedEmail(c: Context<AppEnv>): string | null {
  const user = c.get("user")
  return user.emailVerified ? normalizeSignerEmail(user.email) : null
}

/** This caller's recipient row by id, or 404 (also for another person's id). */
async function ownRecipient(c: Context<AppEnv>) {
  const email = verifiedEmail(c)
  if (!email) notFound("Envelope")
  const recipient = await prisma.recipient.findFirst({
    where: {
      id: c.req.param("recipientId"),
      email: { equals: email as string, mode: "insensitive" },
      envelope: { status: { not: "DRAFT" } },
    },
    include: {
      envelope: {
        include: {
          certificate: true,
          documents: envelopeDocumentsSelect,
          attachments: { ...envelopeAttachmentsSelect, where: { status: "READY" } },
        },
      },
    },
  })
  if (!recipient) notFound("Envelope")
  return recipient as NonNullable<typeof recipient>
}

const perUser = (bucket: string, limit: number, windowSec: number) =>
  rateLimit({
    bucket,
    limit,
    windowSec,
    key: (c) => (c.get("user" as never) as { id: string }).id,
  })

export const myEnvelopes = new Hono<AppEnv>()
  .use(requireUser)

  .get("/", perUser("my-envelopes", 60, 60), async (c) => {
    const email = verifiedEmail(c)
    if (!email) return c.json({ verified: false, items: [] })
    const rows = await prisma.recipient.findMany({
      where: {
        email: { equals: email, mode: "insensitive" },
        envelope: { status: { not: "DRAFT" } },
      },
      orderBy: { envelope: { sentAt: "desc" } },
      take: 200,
      select: {
        id: true,
        role: true,
        status: true,
        signedAt: true,
        delivery: true,
        envelope: {
          select: {
            title: true,
            status: true,
            sentAt: true,
            completedAt: true,
            purgedAt: true,
            organization: { select: { name: true } },
            createdBy: { select: { name: true } },
            certificate: { select: { code: true } },
          },
        },
      },
    })
    return c.json({
      verified: true,
      items: rows.map((r) => ({
        recipientId: r.id,
        title: r.envelope.title,
        workspace: r.envelope.organization.name,
        sender: r.envelope.createdBy.name,
        role: r.role,
        status: r.status,
        signedAt: r.signedAt,
        envelopeStatus: r.envelope.status,
        sentAt: r.envelope.sentAt,
        completedAt: r.envelope.completedAt,
        purged: Boolean(r.envelope.purgedAt),
        group: signerListGroup(r.status, r.envelope.status),
        // The public certificate code, as on the certificate itself (once there is one).
        certificateCode: r.envelope.certificate?.code ?? null,
        canDownload: signerCanDownload({
          status: r.envelope.status,
          purgedAt: r.envelope.purgedAt,
          hasCertificate: Boolean(r.envelope.certificate),
        }),
        // Emailed recipients whose turn it is may ask for a fresh link (embedded ones sign in the
        // sender's own app).
        canRequestLink:
          r.delivery !== "EMBEDDED" &&
          r.status !== "PENDING" &&
          signerListGroup(r.status, r.envelope.status) === "waiting",
      })),
    })
  })

  /** The signed PDFs, certificate and supporting files of a completed envelope, as the signer gets them. */
  .get("/:recipientId/downloads", perUser("my-envelopes-download", 30, 60), async (c) => {
    const r = await ownRecipient(c)
    if (r.envelope.purgedAt) {
      return c.json(
        { error: "purged", message: "These files were deleted under the data retention policy" },
        410,
      )
    }
    if (r.envelope.status !== "COMPLETED") return c.json({ error: "not_available" }, 409)
    return c.json(await downloadLinks(r.envelope))
  })

  /**
   * Email this recipient a fresh signing link (the raw token goes only to the job and the email,
   * never in the response). Same rules and cooldown as the sender's "Send reminder".
   */
  .post("/:recipientId/link", perUser("my-envelopes-link", 5, 600), async (c) => {
    const r = await ownRecipient(c)
    if (r.delivery === "EMBEDDED") return c.json({ error: "embedded" }, 409)
    const availability = reminderAvailability(r, r.envelope.status)
    if (!availability.ok) {
      if (availability.reason === "cooldown") {
        c.header("Retry-After", String(availability.waitSec))
        return c.json(
          {
            error: "link_cooldown",
            message: "A link was sent recently",
            retryAfterSec: availability.waitSec,
          },
          429,
        )
      }
      return c.json({ error: availability.reason, message: "There's nothing to sign here" }, 409)
    }
    const link = await prisma.$transaction(async (tx) => {
      const l = await rotateRecipientLink(tx, r.id)
      await appendAuditEvent(tx, {
        envelopeId: r.envelopeId,
        type: "recipient.link_requested",
        recipientId: r.id,
        actorUserId: c.get("user").id,
        ...clientMeta(c),
      })
      return l
    })
    await getQueues().notifications.add("envelope.reminder", link)
    return c.json({ ok: true })
  })
