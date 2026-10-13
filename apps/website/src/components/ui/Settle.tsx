"use client"

import { type ReactNode, useEffect, useRef } from "react"

/**
 * One-shot "settle" for product pictures: when the picture is mostly in view, it gets
 * `data-settled`, and CSS transitions its `data-s` parts from slightly lifted and transparent to
 * rest (globals.css → Settle). Transform and opacity only; reduced motion keeps a short fade.
 * Fills its positioned parent, so it can wrap absolutely placed pictures. Mark the parts with
 * `s()` from ./settleMarks.ts (kept out of this "use client" file so server components can call it).
 */
export function Settle({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        el.dataset.settled = ""
        io.disconnect()
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`settle absolute inset-0 ${className}`}>
      {children}
    </div>
  )
}
