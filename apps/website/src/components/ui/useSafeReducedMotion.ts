"use client"

import { useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

/**
 * Hydration-safe `useReducedMotion`. The server can't know the visitor's
 * setting, so it renders the animated tree; Motion's hook reads matchMedia on
 * the client's first render and would pick the static tree, causing a
 * hydration mismatch. This reports `false` until after hydration, so the first
 * client render matches the server, then switches.
 */
export function useSafeReducedMotion(): boolean {
  const reduce = useReducedMotion()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated && Boolean(reduce)
}
