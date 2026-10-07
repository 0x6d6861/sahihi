import { type CreateAndSendResult, InvalidTransitionError } from "@sahihi/core"
import { type Actor, EnvelopeError, sendEnvelope } from "@sahihi/envelopes"

/**
 * Sends an envelope the same request just created ("Send now" on a template). The draft
 * is already committed, so a refused send (preflight, plan quota, wrong state) is not an error
 * response: the caller gets `sent: false` with the reason and the draft's id, and the sender
 * finishes it on the draft page (docs/signing-flow.md → Quick send). Anything else still throws.
 */
export async function sendAfterCreate(input: {
  envelopeId: string
  organizationId: string
  actor: Actor
}): Promise<CreateAndSendResult> {
  const envelope = { id: input.envelopeId }
  try {
    await sendEnvelope(input)
    return { envelope, sent: true }
  } catch (err) {
    if (err instanceof EnvelopeError) {
      return {
        envelope,
        sent: false,
        ...(err.body as Omit<CreateAndSendResult, "envelope" | "sent">),
      }
    }
    if (err instanceof InvalidTransitionError) {
      return { envelope, sent: false, error: "invalid_state", message: err.message }
    }
    throw err
  }
}
