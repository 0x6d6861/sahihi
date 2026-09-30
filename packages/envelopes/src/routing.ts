import { getEnv } from "@sahihi/config"
import { currentRecipients } from "@sahihi/core"
import { appendAuditEvent, issueSigningLink, type Prisma } from "@sahihi/db"

export interface IssuedLink {
  recipientId: string
  /** RAW token — pass straight to the notifications queue, never persist. */
  token: string
}

function linkExpiry(envelopeExpiresAt: Date | null) {
  const ttlMs = getEnv().SIGNING_LINK_TTL_DAYS * 86_400_000
  return new Date(
    Math.min(Date.now() + ttlMs, envelopeExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY),
  )
}

/**
 * Issue signing links to every recipient whose turn it now is and who has not
 * been notified yet. Call inside the same transaction as the state change
 * (send / a recipient signing). Enqueue the returned links AFTER commit.
 */
export async function activateNextRecipients(
  tx: Prisma.TransactionClient,
  envelopeId: string,
): Promise<IssuedLink[]> {
  const envelope = await tx.envelope.findUniqueOrThrow({
    where: { id: envelopeId },
    include: { recipients: true },
  })
  const due = currentRecipients(envelope.recipients, envelope.signingOrder).filter(
    (r) => r.status === "PENDING",
  )
  const issued: IssuedLink[] = []
  for (const r of due) {
    // Embedded recipients sign inside the sender's app: their turn starts now, but no link is
    // issued or emailed until the API asks for a signing URL (docs/embedded-signing.md).
    if (r.delivery === "EMBEDDED") {
      await tx.recipient.update({
        where: { id: r.id },
        data: { status: "SENT", notifiedAt: new Date() },
      })
      await appendAuditEvent(tx, {
        envelopeId,
        type: "recipient.notified",
        recipientId: r.id,
        data: { delivery: "embedded" },
      })
      continue
    }
    issued.push(
      await issueSigningLink(tx, r.id, linkExpiry(envelope.expiresAt), {
        status: "SENT",
        notifiedAt: new Date(),
      }),
    )
    await appendAuditEvent(tx, {
      envelopeId,
      type: "recipient.notified",
      recipientId: r.id,
      data: { email: r.email },
    })
  }
  return issued
}

/** Rotate a recipient's link (manual reminder / resend). The old link stops working. */
export async function rotateRecipientLink(
  tx: Prisma.TransactionClient,
  recipientId: string,
): Promise<IssuedLink> {
  const r = await tx.recipient.findUniqueOrThrow({
    where: { id: recipientId },
    include: { envelope: { select: { expiresAt: true } } },
  })
  return issueSigningLink(tx, recipientId, linkExpiry(r.envelope.expiresAt), {
    lastRemindedAt: new Date(),
    reminderCount: { increment: 1 },
  })
}

/**
 * A short-lived signing URL token for an EMBEDDED recipient (public API). Rotates any previous
 * one. Valid for EMBED_LINK_TTL_MS (or until the envelope expires), for the whole session.
 */
export async function issueEmbeddedSigningLink(
  tx: Prisma.TransactionClient,
  recipientId: string,
  expiresAt: Date,
): Promise<IssuedLink> {
  return issueSigningLink(tx, recipientId, expiresAt)
}
