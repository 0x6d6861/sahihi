"use client"

import { AnimatePresence, motion } from "motion/react"
import { useId, useState } from "react"
import { useSafeReducedMotion } from "@/components/ui/useSafeReducedMotion"

const ease = [0.22, 1, 0.36, 1] as const

/**
 * Accordion that stays within "transform and opacity only". Heights snap; the
 * rows below glide from their old position via Motion's layout (a translate),
 * so nothing visibly jumps. Hairlines are each row's top border plus a closing
 * rule, so every line moves with a row instead of snapping with a height.
 */
export function FaqList({ items }: { items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const reduce = useSafeReducedMotion()
  const id = useId()
  const layout = reduce ? false : "position"
  const move = { layout: { duration: 0.3, ease } }

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })

  return (
    <div className="relative mt-12">
      {items.map((item, i) => {
        const isOpen = open.has(i)
        return (
          <motion.div
            key={item.q}
            layout={layout}
            transition={move}
            data-faq-item
            className="relative border-t border-line"
          >
            <h3>
              <button
                type="button"
                id={`${id}-q${i}`}
                aria-expanded={isOpen}
                aria-controls={`${id}-a${i}`}
                onClick={() => toggle(i)}
                data-open={isOpen || undefined}
                className="text-sub flex w-full cursor-pointer items-center justify-between gap-6 py-6 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {item.q}
                <span className="relative size-4 shrink-0" aria-hidden>
                  <span className="absolute left-0 top-1/2 h-px w-4 bg-ink" />
                  <span className="faq-plus-v absolute left-1/2 top-0 h-4 w-px bg-ink transition-transform duration-200 ease-out" />
                </span>
              </button>
            </h3>
            {/* popLayout takes a closing answer out of flow at once, so the rows below start rising while it fades. */}
            <AnimatePresence initial={false} mode="popLayout">
              {isOpen && (
                <motion.p
                  key="a"
                  id={`${id}-a${i}`}
                  role="region"
                  aria-labelledby={`${id}-q${i}`}
                  data-faq-answer
                  initial={{ opacity: 0, y: reduce ? 0 : -4 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease, delay: 0.05 } }}
                  exit={{ opacity: 0, transition: { duration: 0.12, ease: "easeOut" } }}
                  className="text-caption max-w-[36em] pb-7 font-normal text-muted"
                >
                  {item.a}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
      <motion.div layout={layout} transition={move} className="border-t border-line" />
    </div>
  )
}
