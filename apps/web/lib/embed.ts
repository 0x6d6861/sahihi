import type { EmbedEvent } from "@sahihi/core"

type State = "ready" | "waiting" | "signed" | "completed" | "declined" | "expired" | "closed"

/**
 * Which postMessage event a signing-state change means for the embedding app
 * (docs/embedded-signing.md). `prev` is null on the first load.
 */
export function embedEventFor(prev: State | null, next: State): EmbedEvent | null {
  if (prev === null) return "sahihi:ready"
  if (prev === next) return null
  if (next === "signed" || next === "completed") return "sahihi:signed"
  if (next === "declined") return "sahihi:declined"
  return null
}

/**
 * Posts to the parent window, once per allowed origin: the browser delivers it only if the parent
 * really is that origin, so nothing leaks to an unexpected embedder. No-op outside an iframe.
 */
export function postEmbedEvent(
  event: EmbedEvent,
  state: State,
  origins: string[],
  target: Pick<Window, "postMessage"> | null,
) {
  if (!target) return
  for (const origin of origins) target.postMessage({ type: event, state }, origin)
}
