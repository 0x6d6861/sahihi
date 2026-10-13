"use client"

import { motion, type Variants } from "motion/react"
import type { ReactNode } from "react"
import { useSafeReducedMotion } from "./useSafeReducedMotion"

const ease = [0.22, 1, 0.36, 1] as const

/** Gentle fade-and-rise when the block enters the viewport. */
export function Reveal({
  children,
  delay = 0,
  distance = 12,
  className,
}: {
  children: ReactNode
  /** Stagger delay (s). Only applied from `md` up, where staggered items sit side by side. */
  delay?: number
  /** How far (px) the block rises as it fades in. */
  distance?: number
  className?: string
}) {
  const reduce = useSafeReducedMotion()
  const variants: Variants = {
    hidden: { opacity: 0, y: distance },
    // A function so the viewport width is read when the block reveals, not at render.
    // On one column each item enters alone, so a stagger delay would just be lag.
    shown: () => ({
      opacity: 1,
      y: 0,
      transition: {
        default: {
          duration: 0.45,
          ease,
          delay: !reduce && window.matchMedia("(min-width: 48rem)").matches ? delay : 0,
        },
        // Reduced motion keeps the fade but drops the movement.
        ...(reduce && { y: { duration: 0 } }),
      },
    }),
  }
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
    >
      {children}
    </motion.div>
  )
}
