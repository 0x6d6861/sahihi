import type { CSSProperties } from "react"

export type SettleKind = "lift" | "drop" | "pop" | "fade"

/**
 * Marks a part of a picture that settles: its order (`i`, staggered 50 ms apart), an extra delay
 * in ms, and how it arrives (`lift` rises, `drop` falls, `pop` grows, `fade` only fades).
 */
export function s(
  i = 0,
  delay = 0,
  kind: SettleKind = "lift",
): {
  "data-s": SettleKind
  style: CSSProperties
} {
  return { "data-s": kind, style: { "--i": i, "--s-delay": `${delay}ms` } as CSSProperties }
}
