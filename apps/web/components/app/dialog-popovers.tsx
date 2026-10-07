"use client"

import { useReducedMotion } from "motion/react"
import { useEffect, useRef } from "react"

/**
 * Class for an Arc `DialogContent` that holds an Arc field with an inline popover (`DatePicker`'s
 * calendar, `ColorPicker`'s panel, `Combobox`'s list). Arc's dialog scrolls its content
 * (`overflow: auto`) and those popovers are absolutely positioned inside it, so the dialog's edge
 * cut them off. On a window at least `sm` wide and 46rem tall the dialog lets them overflow and sits
 * near the top, leaving room below for a popover to open downwards (put such fields high in the
 * form). Smaller windows keep Arc's scrolling: an open popover extends the scroll area, so it is
 * reached by scrolling the dialog instead of being cut off for good.
 */
export const DIALOG_WITH_POPOVERS =
  "sm:[@media(min-height:46rem)]:overflow-visible! sm:[@media(min-height:46rem)]:mt-[8vh]! sm:[@media(min-height:46rem)]:mb-auto!"

/** What Arc's inline popovers render as: ColorPicker panel, Combobox list, DatePicker calendar. */
const POPOVER = '[role="dialog"], [role="listbox"], [role="grid"]'

/**
 * Wraps the fields of a dialog that uses `DIALOG_WITH_POPOVERS`. When a popover opens inside it,
 * the dialog scrolls just enough to show the whole popover, which matters on short windows where
 * the dialog still scrolls.
 */
export function RevealPopovers({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          const popover = node.matches(POPOVER) ? node : node.querySelector<HTMLElement>(POPOVER)
          // After the opening frame, once the popover has its size.
          if (popover) {
            requestAnimationFrame(() =>
              popover.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }),
            )
          }
        }
      }
    })
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [reduced])

  return <div ref={ref}>{children}</div>
}
