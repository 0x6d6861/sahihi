import type { CSSProperties } from "react"

/** Most stagger steps a list uses; later items share the last delay so the cascade stays under 0.3s. */
const MAX_STAGGER_STEPS = 8

/**
 * Inline style for the `n`th item of a list using the `enter-fade` class (app/app.css): sets `--i`,
 * which delays its entrance by 35ms per step.
 */
export function stagger(index: number): CSSProperties {
  return { "--i": Math.min(Math.max(index, 0), MAX_STAGGER_STEPS) } as CSSProperties
}
