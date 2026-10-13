/**
 * Building blocks for the coded product demos. Sizes are in `em` off `.demo-root`
 * (globals.css), colours come from the `--dm-*` palette, which follows the theme.
 * They copy the app's own cards (Arc): rounded surfaces, hairline borders, pill buttons.
 */
import type { CSSProperties, ReactNode } from "react"

export function DemoRoot({
  children,
  scale,
  className = "",
}: {
  children: ReactNode
  scale?: number
  className?: string
}) {
  return (
    <div
      className={`demo-root absolute inset-0 flex items-center justify-center ${className}`}
      style={scale ? ({ "--dm": scale } as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}

export const tone = (i: number) => `var(--dm-tone-${i % 3})`

/** An app card: surface, hairline border, large radius, soft lift. */
export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`rounded-[1.4em] border border-(--dm-line) bg-(--dm-card) shadow-(--dm-shadow) ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

export function Pill({
  children,
  kind = "outline",
  className = "",
}: {
  children: ReactNode
  kind?: "primary" | "outline" | "ghost" | "disabled"
  className?: string
}) {
  const look = {
    primary: "bg-(--dm-accent) text-(--dm-on-accent)",
    outline: "border border-(--dm-line) bg-(--dm-card)",
    ghost: "text-(--dm-text-2)",
    disabled: "bg-(--dm-disabled) text-white",
  }[kind]
  return (
    <span
      className={`inline-flex items-center justify-center gap-[0.35em] whitespace-nowrap rounded-full px-[1.1em] py-[0.45em] text-[0.85em] ${look} ${className}`}
    >
      {children}
    </span>
  )
}

export function Badge({
  children,
  kind = "neutral",
}: {
  children: ReactNode
  kind?: "neutral" | "success"
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-[0.6em] py-[0.1em] text-[0.72em] ${
        kind === "success"
          ? "border-(--dm-success)/30 bg-(--dm-success-bg) text-(--dm-success)"
          : "border-(--dm-strong) bg-(--dm-muted) text-(--dm-text-2)"
      }`}
    >
      {children}
    </span>
  )
}

/** An Arc text field: label above, rounded box. */
export function Field({
  label,
  value,
  className = "",
}: {
  label?: string
  value?: string
  className?: string
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-[0.35em] ${className}`}>
      {label && <span className="text-[0.8em]">{label}</span>}
      <span className="truncate rounded-full border border-(--dm-strong) px-[0.9em] py-[0.45em] text-[0.85em]">
        {value ?? " "}
      </span>
    </div>
  )
}

/** Lucide-style line icons, 1em square, drawn in currentColor. */
const paths: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />,
  seal: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  sign: <path d="M3 17c2-3 3.5-9 5.5-9S8 18 10.5 18s3-6 4.5-6 .5 4 2 4 2-2 4-2" />,
  consent: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  view: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5z" />
      <path d="M14 3v4.5h4.5M9 13h6M9 16.5h4" />
    </>
  ),
  undo: <path d="M9 7L4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2" />,
}

export function Icon({
  name,
  className = "",
}: {
  name: keyof typeof paths | string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-[1em] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  )
}

/** A drawn signature: loops along a line, like a quick hand signature. */
export function Scrawl({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 70" className={className} fill="none" aria-hidden>
      <path
        d="M8 48c10-26 22-38 28-30s-14 38-6 38 18-34 30-34-6 26 2 26 14-20 22-20 2 16 10 16 12-14 20-14 4 10 12 10 14-10 22-10 6 6 14 5 18-6 24-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 60c40-6 110-10 180-14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
