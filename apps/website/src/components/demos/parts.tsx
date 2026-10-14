/**
 * Building blocks for the coded product demos. Sizes are in `em` off `.demo-root`
 * (globals.css), colours come from the `--dm-*` palette, which follows the theme.
 * They copy the app's own cards (Arc): rounded surfaces, hairline borders, crisp buttons and fields (ADR 0053).
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
  at,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** How the card settles into its panel (`s()` from ui/settleMarks). */
  at?: { "data-s": string; style: CSSProperties }
}) {
  return (
    <div
      data-s={at?.["data-s"]}
      className={`rounded-[0.8em] border border-(--dm-line) bg-(--dm-card) shadow-(--dm-shadow) ${className}`}
      style={{ ...at?.style, ...style }}
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
      className={`inline-flex items-center justify-center gap-[0.35em] whitespace-nowrap rounded-[0.55em] px-[1.1em] py-[0.45em] text-[0.85em] ${look} ${className}`}
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
      <span className="truncate rounded-[0.55em] border border-(--dm-strong) px-[0.9em] py-[0.45em] text-[0.85em]">
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
  redo: <path d="M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h2" />,
  folder: (
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
  ),
  folderPlus: (
    <>
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  sparkles: (
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
  ),
  inbox: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M3.5 13.5h4.5l1.5 2h5l1.5-2h4.5" />
    </>
  ),
  upload: (
    <path d="M12 15V4.5M7.5 9L12 4.5 16.5 9M4.5 15.5v2A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2v-2" />
  ),
  download: (
    <path d="M12 4.5V15M7.5 10.5L12 15l4.5-4.5M4.5 15.5v2A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2v-2" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  updown: <path d="M8 9.5L12 5.5l4 4M8 14.5l4 4 4-4" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 7.5l8 5.5 8-5.5" />
    </>
  ),
  more: <path d="M12 6h.01M12 12h.01M12 18h.01" />,
  moreH: <path d="M6 12h.01M12 12h.01M18 12h.01" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
    </>
  ),
  hourglass: <path d="M7 4h10M7 20h10M8 4c0 4.5 8 6 8 8s-8 3.5-8 8M16 4c0 4.5-8 6-8 8s8 3.5 8 8" />,
  draft: (
    <>
      <path d="M13 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h3.5" />
      <path d="M13 3.5V8h4.5M13 3.5l4.5 4.5v2.5M14 20l.6-2.6 4.9-4.9a1.4 1.4 0 0 1 2 2l-4.9 4.9z" />
    </>
  ),
  template: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <path d="M8 8h8M8 11.5h8M8 15h4M15 15l1.5 1.5 3-3" />
    </>
  ),
  send: <path d="M20.5 3.5L10 14M20.5 3.5L14 20.5l-4-6.5-6.5-4z" />,
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M15.5 5.6a3.2 3.2 0 0 1 0 6M17 14.4c2 .5 3.2 2.1 3.6 4.6" />
    </>
  ),
  pointer: <path d="M5 4l6.5 16 2.2-6.6L20 11.3z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9 4.5v15" />
    </>
  ),
  rotateCw: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  rotateCcw: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />,
  zoomIn: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12h7" />
    </>
  ),
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  pen: (
    <path d="M14.5 5.5l4 4M4.5 19.5l1-4L16 5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L8.5 18.5z" />
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
    </>
  ),
  at: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.3 6.7" />
    </>
  ),
  text: <path d="M6 5.5h12M12 5.5v13" />,
  checkbox: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  detect: (
    <>
      <path d="M13 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V9z" />
      <circle cx="11.5" cy="13.5" r="2.5" />
      <path d="M13.3 15.3l2 2" />
    </>
  ),
  building: (
    <path d="M5 20.5V6.5L12 3.5v17M12 8.5h6.5v12M3.5 20.5h17M8 9.5h.01M8 13h.01M8 16.5h.01M15 12h.01M15 15.5h.01" />
  ),
  eraser: (
    <path d="M8 20.5h11M5.3 14.8l8.5-8.5a2 2 0 0 1 2.8 0l2.1 2.1a2 2 0 0 1 0 2.8L11 18.9a2 2 0 0 1-2.8 0l-2.9-2.9a.85.85 0 0 1 0-1.2z" />
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  clip: (
    <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7" />
  ),
  arrowUp: <path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" />,
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
