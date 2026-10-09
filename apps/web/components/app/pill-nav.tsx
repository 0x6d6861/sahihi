"use client"

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { Badge } from "@/components/arc/badge/badge"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { cn } from "@/lib/utils"

export interface PillNavItem {
  id: string
  label: string
  icon: IconSvgElement
  active: boolean
  /** A link (app sections) … */
  href?: string
  /** … or an action (editor steps). */
  onSelect?: () => void
  disabled?: boolean
  /** Arc tooltip on hover and focus */
  hint?: string
  /** A count after the label (the Inbox's unread notifications); hidden at 0 */
  badge?: number
}

/**
 * The segmented pill of the top bars (ADR 0026, ADR 0031): items on a `bg-muted` track, the
 * active one a raised `bg-background` pill that glides between items (Motion `layoutId`, instant
 * with reduced motion). Stretches to the full width below `md`; labels only below `sm`.
 * `current` is what `aria-current` announces: "page" for navigation, "step" for the editor.
 */
export function PillNav({
  id,
  label,
  items,
  current = "page",
  className,
}: {
  /** Unique per page: scopes the gliding pill */
  id: string
  label: string
  items: PillNavItem[]
  current?: "page" | "step"
  className?: string
}) {
  return (
    <nav aria-label={label} className={className}>
      <LayoutGroup id={id}>
        <ul className="flex w-full items-center gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none] md:w-auto">
          {items.map((item) => (
            <PillNavEntry key={item.id} item={item} layoutId={`${id}-active`} current={current} />
          ))}
        </ul>
      </LayoutGroup>
    </nav>
  )
}

function PillNavEntry({
  item,
  layoutId,
  current,
}: {
  item: PillNavItem
  layoutId: string
  current: "page" | "step"
}) {
  const reduced = useReducedMotion()
  const badge = item.badge ? (item.badge > 99 ? "99+" : String(item.badge)) : null
  const className = cn(
    "relative isolate flex h-9 items-center justify-center gap-2 rounded-full px-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4",
    item.active
      ? "font-medium text-foreground"
      : "text-muted-foreground transition-colors hover:text-foreground",
    item.disabled && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
  )
  const content = (
    <>
      {item.active && (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm"
          transition={reduced ? { duration: 0 } : motionTokens.spring.snappy}
        />
      )}
      <span className="flex max-sm:hidden">
        <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} aria-hidden />
      </span>
      <span>{item.label}</span>
      {badge && (
        <Badge tone="info" size="sm" aria-hidden className="tabular-nums">
          {badge}
        </Badge>
      )}
    </>
  )
  const ariaCurrent = item.active ? current : undefined
  const ariaLabel = badge ? `${item.label}, ${item.badge} unread` : undefined
  const control = item.href ? (
    <Link href={item.href} aria-current={ariaCurrent} aria-label={ariaLabel} className={className}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      aria-current={ariaCurrent}
      // aria-disabled keeps it focusable, so the tooltip can say why it's not available yet.
      aria-disabled={item.disabled || undefined}
      onClick={() => {
        if (!item.disabled) item.onSelect?.()
      }}
      className={cn(className, "w-full")}
    >
      {content}
    </button>
  )
  return (
    <li className="max-md:flex-1">
      {item.hint ? <Tooltip content={item.hint}>{control}</Tooltip> : control}
    </li>
  )
}
