import { cn } from "@/lib/utils"

const VIEWBOX = 20
const STROKE = 2.5
const RADIUS = (VIEWBOX - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * A small circular progress mark for counts such as "2 of 3 signed" (ADR 0036). Arc, coss and
 * shadcn have no ring, so this is a static SVG composition: a hairline track and an arc that fills
 * clockwise from 12 o'clock, `info` while under way and `success` when complete. Named for
 * assistive tech with `label`; the visible count, if any, is the caller's. The arc eases to a
 * new value (no movement under reduced motion).
 */
export function ProgressRing({
  value,
  max,
  label,
  size = 20,
  className,
}: {
  value: number
  max: number
  label: string
  /** Pixels. */
  size?: number
  className?: string
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  const complete = max > 0 && ratio >= 1
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      className={cn("shrink-0 -rotate-90", className)}
    >
      <circle
        cx={VIEWBOX / 2}
        cy={VIEWBOX / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-border"
      />
      {ratio > 0 && (
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          className={cn(
            "transition-[stroke-dashoffset] duration-(--duration-standard) ease-(--ease-enter) motion-reduce:transition-none",
            complete ? "stroke-success-foreground" : "stroke-info-foreground",
          )}
        />
      )}
    </svg>
  )
}
