import { labelColorName } from "@sahihi/core"
import { Badge } from "@/components/arc/badge/badge"
import type { TagRef } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * A label colour (user-picked hex, ADR 0025) as a small dot: on documents and folders and in the
 * Color filter. A hairline ring keeps light colours visible on the page. Decorative; pair it with
 * `ColorName` where the colour carries meaning.
 */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-3 shrink-0 rounded-full ring-1 ring-border ring-inset",
        className,
      )}
      style={{ background: color }}
    />
  )
}

/** Screen-reader text for a coloured item ("Blue" or the hex), since the dot isn't announced. */
export function ColorName({ color }: { color: string | null | undefined }) {
  return color ? <span className="sr-only">{`, ${labelColorName(color)} label`}</span> : null
}

/** An item's tags as small neutral badges; past `max`, a "+N" badge. */
export function TagBadges({ tags, max = 3 }: { tags: TagRef[]; max?: number }) {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max)
  const rest = tags.length - shown.length
  return (
    <ul aria-label="Tags" className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((t) => (
        <li key={t.id} className="min-w-0">
          <Badge size="sm" className="max-w-40 truncate">
            {t.name}
          </Badge>
        </li>
      ))}
      {rest > 0 && (
        <li
          title={tags
            .slice(max)
            .map((t) => t.name)
            .join(", ")}
        >
          <Badge size="sm">+{rest}</Badge>
        </li>
      )}
    </ul>
  )
}
