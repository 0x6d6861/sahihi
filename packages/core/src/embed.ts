import { z } from "zod"

/**
 * Embedded signing (docs/embedded-signing.md): the origins allowed to show /sign in an iframe.
 * Exact origins only (scheme + host + port); https, except localhost for development.
 */
export const EMBED_MAX_ORIGINS = 10
/** How long an embedded signing URL works (it's used for the whole signing session). */
export const EMBED_LINK_TTL_MS = 30 * 60_000

export function normalizeEmbedOrigin(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null
  if (url.username || url.password) return null
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return null
  return url.origin
}

export const EmbedSettingsSchema = z.object({
  origins: z
    .array(z.string())
    .max(EMBED_MAX_ORIGINS, `Up to ${EMBED_MAX_ORIGINS} origins`)
    .transform((list, ctx) => {
      const out: string[] = []
      list.forEach((raw, i) => {
        const origin = normalizeEmbedOrigin(raw)
        if (!origin) {
          ctx.addIssue({
            code: "custom",
            path: [i],
            message: "Use an origin like https://app.example.com (https, no path)",
          })
        } else if (!out.includes(origin)) out.push(origin)
      })
      return out
    }),
})

/** postMessage events the signing page sends to the embedding window. */
export const EMBED_EVENTS = ["sahihi:ready", "sahihi:signed", "sahihi:declined"] as const
export type EmbedEvent = (typeof EMBED_EVENTS)[number]
