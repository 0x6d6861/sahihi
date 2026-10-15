import { Badge as ArcBadge, type BadgeProps } from "@/components/arc/badge/badge"
import { cn } from "@/lib/utils"

export type { BadgeProps, BadgeTone } from "@/components/arc/badge/badge"

/**
 * Arc's Badge with the info tone on the status blue (ADR 0060). Arc paints `info` from the accent,
 * which is emerald (ADR 0058), so "in progress" would read as "completed"; the `app-info` class
 * (app.css) points the accent tokens at `--info` on this badge only. Import this, not the Arc file.
 */
export function Badge({ tone, className, ...props }: BadgeProps) {
  return (
    <ArcBadge tone={tone} className={cn(tone === "info" && "app-info", className)} {...props} />
  )
}
