import { generateSigningToken, hashSigningToken } from "@sahihi/core"
import type { Prisma } from "./generated/prisma/client"

/**
 * Issue (or rotate) a recipient's signing link. Only the hash is stored;
 * the returned RAW token must go straight into a notification job/email.
 * Any previously issued link for this recipient stops working.
 */
export async function issueSigningLink(
  tx: Prisma.TransactionClient,
  recipientId: string,
  expiresAt: Date,
  extra: Prisma.RecipientUpdateInput = {},
): Promise<{ recipientId: string; token: string }> {
  const token = generateSigningToken()
  await tx.recipient.update({
    where: { id: recipientId },
    data: { ...extra, tokenHash: await hashSigningToken(token), tokenExpiresAt: expiresAt },
  })
  return { recipientId, token }
}
