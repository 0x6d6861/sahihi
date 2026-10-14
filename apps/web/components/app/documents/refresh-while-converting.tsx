"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

const EVERY_MS = 3_000
/** The worker gives up on a conversion within the hour; the page stops asking well before. */
const FOR_MS = 10 * 60_000

/**
 * While a Word upload converts (ADR 0052), re-renders the server page every few seconds so the
 * document shows up READY (or FAILED, with its reason) without a manual reload.
 */
export function RefreshWhileConverting() {
  const router = useRouter()
  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - started > FOR_MS) clearInterval(timer)
      else router.refresh()
    }, EVERY_MS)
    return () => clearInterval(timer)
  }, [router])
  return null
}
