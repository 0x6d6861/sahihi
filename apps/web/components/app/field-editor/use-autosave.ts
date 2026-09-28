"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type AutosaveStatus = "saved" | "pending" | "saving" | "error"

/**
 * Debounced, serialized autosave. Each `revision` bump schedules a save after `delay` ms. Saves
 * never overlap: a change during a save queues exactly one follow-up, so the server always ends
 * with the latest state (responses can't arrive out of order). `flush()` saves now and resolves
 * once nothing is pending (used before sending the envelope).
 */
export function useAutosave(revision: number, save: () => Promise<void>, delay = 800) {
  const [status, setStatus] = useState<AutosaveStatus>("saved")
  const saveRef = useRef(save)
  saveRef.current = save
  const inflight = useRef<Promise<void> | null>(null)
  const queued = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failed = useRef(false)

  const run = useCallback((): Promise<void> => {
    if (inflight.current) {
      queued.current = true
      return inflight.current
    }
    const p = (async () => {
      setStatus("saving")
      failed.current = false
      try {
        await saveRef.current()
      } catch {
        failed.current = true
      }
      inflight.current = null
      if (queued.current) {
        queued.current = false
        await run()
      } else {
        setStatus(failed.current ? "error" : "saved")
      }
    })()
    inflight.current = p
    return p
  }, [])

  useEffect(() => {
    if (revision === 0) return
    setStatus("pending")
    timer.current = setTimeout(() => {
      timer.current = null
      void run()
    }, delay)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [revision, delay, run])

  /** Save pending changes now. Resolves true if everything is saved. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      await run()
    } else if (inflight.current) {
      await inflight.current
    }
    return !failed.current
  }, [run])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (status !== "pending" && status !== "saving") return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [status])

  return { status, retry: run, flush }
}
