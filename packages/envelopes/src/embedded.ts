import { EMBED_LINK_TTL_MS } from "@sahihi/core"
import { appendAuditEvent, prisma } from "@sahihi/db"
import { EnvelopeError, notFound } from "./errors"
import { issueEmbeddedSigningLink } from "./routing"
import { type Actor, actorData } from "./send"

/**
 * Issue a signing URL token for an EMBEDDED recipient whose turn it is (docs/embedded-signing.md).
 * The raw token goes straight back to the API caller (never stored, never logged).
 */
export async function createEmbeddedSigningLink(input: {
  envelopeId: string
  recipientId: string
  organizationId: string
  actor: Actor
}): Promise<{ token: string; expiresAt: Date }> {
  const r = await prisma.recipient.findFirst({
    where: {
      id: input.recipientId,
      envelope: { id: input.envelopeId, organizationId: input.organizationId },
    },
    include: { envelope: { select: { status: true, expiresAt: true } } },
  })
  if (!r) notFound("Recipient")
  const recipient = r as NonNullable<typeof r>
  if (recipient.delivery !== "EMBEDDED") {
    throw new EnvelopeError(409, "not_embedded", "This recipient is invited by email, not embedded")
  }
  if (!["SENT", "IN_PROGRESS"].includes(recipient.envelope.status)) {
    throw new EnvelopeError(409, "envelope_not_active", "The envelope isn't out for signature")
  }
  if (recipient.status === "PENDING") {
    throw new EnvelopeError(409, "not_their_turn", "It isn't this recipient's turn yet")
  }
  if (recipient.status !== "SENT" && recipient.status !== "VIEWED") {
    throw new EnvelopeError(409, "already_done", "This recipient has already signed or declined")
  }
  const expiresAt = new Date(
    Math.min(Date.now() + EMBED_LINK_TTL_MS, recipient.envelope.expiresAt?.getTime() ?? Infinity),
  )
  const link = await prisma.$transaction(async (tx) => {
    const issued = await issueEmbeddedSigningLink(tx, recipient.id, expiresAt)
    await appendAuditEvent(tx, {
      envelopeId: input.envelopeId,
      type: "recipient.link_issued",
      recipientId: recipient.id,
      actorUserId: input.actor.userId,
      data: { expiresAt: expiresAt.toISOString(), ...actorData(input.actor) },
      ipAddress: input.actor.ipAddress ?? null,
      userAgent: input.actor.userAgent ?? null,
    })
    return issued
  })
  return { token: link.token, expiresAt }
}
