/**
 * Building blocks for the product mockups. Everything is sized in `em`,
 * and the root font-size scales with the frame (see `.mockup-root` in globals.css),
 * so a mockup reads correctly at any width. Colours come from the mockup
 * palette (`--mk-*`), which follows the page theme; PDF paper stays white.
 */
import type { CSSProperties, ReactNode } from "react"
import { type SampleRecipient, sample } from "@/content/site"

export function MockupRoot({
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
      className={`mockup-root h-full w-full text-(--mk-text) ${className}`}
      style={scale ? ({ "--mk": scale } as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}

export const toneColor = (tone: number) => `var(--mk-tone-${tone % 3})`

/* ── App chrome ────────────────────────────────────────────────── */

export function TrafficLights() {
  return (
    <span className="flex shrink-0 gap-[0.45em]">
      <span className="size-[0.75em] rounded-full bg-[#fe5f57]" />
      <span className="size-[0.75em] rounded-full bg-[#febc2e]" />
      <span className="size-[0.75em] rounded-full bg-[#28c840]" />
    </span>
  )
}

/** Browser title bar with the address of the page shown. */
export function WindowBar({ url }: { url: string }) {
  return (
    <div className="flex h-[2.4em] shrink-0 items-center gap-[0.9em] border-b border-(--mk-line) bg-(--mk-muted) px-[0.9em] text-[0.78em]">
      <TrafficLights />
      <span className="text-(--mk-text-3)">‹ ›</span>
      <span className="mx-auto max-w-[60%] truncate rounded-[0.5em] bg-(--mk-surface) px-[1.4em] py-[0.2em] text-(--mk-text-2)">
        {url}
      </span>
      <span className="w-[3.2em]" />
    </div>
  )
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex items-center gap-[0.45em] font-semibold tracking-[-0.03em] ${className}`}
    >
      <span className="grid size-[1.35em] place-items-center rounded-[0.4em] bg-(--mk-accent) text-[0.8em] text-(--mk-on-accent)">
        S
      </span>
      Sahihi
    </span>
  )
}

/** The app's top-bar navigation (ADR 0026). */
export function AppTopBar({ active = "All files" }: { active?: string }) {
  const nav = ["All files", "Drafting", "Inbox", "Templates"]
  return (
    <div className="flex h-[3em] shrink-0 items-center gap-[1.4em] border-b border-(--mk-line) bg-(--mk-surface) px-[1.2em] text-[0.8em]">
      <Wordmark />
      <nav className="hidden items-center gap-[0.3em] sm:flex">
        {nav.map((n) => (
          <span
            key={n}
            className={`rounded-full px-[0.8em] py-[0.25em] ${
              n === active ? "bg-(--mk-muted)" : "text-(--mk-text-2)"
            }`}
          >
            {n}
          </span>
        ))}
      </nav>
      <span className="ml-auto flex items-center gap-[0.9em] text-(--mk-text-2)">
        <span>{sample.workspace}</span>
        <span className="relative">
          ◔
          <span className="absolute -right-[0.2em] -top-[0.1em] size-[0.45em] rounded-full bg-(--mk-danger)" />
        </span>
        <Avatar name={sample.recipients[0].name} tone={0} />
      </span>
    </div>
  )
}

export function PanelLabel({ children }: { children: ReactNode }) {
  return <p className="text-[0.72em] text-(--mk-text-3)">{children}</p>
}

export function Button({
  children,
  primary = false,
  className = "",
}: {
  children: ReactNode
  primary?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-[0.4em] whitespace-nowrap rounded-full px-[1em] py-[0.35em] text-[0.78em] ${
        primary
          ? "bg-(--mk-accent) text-(--mk-on-accent)"
          : "border border-(--mk-line) bg-(--mk-surface) text-(--mk-text)"
      } ${className}`}
    >
      {children}
    </span>
  )
}

/** A floating card: surface, hairline, soft shadow. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[0.9em] border border-(--mk-line) bg-(--mk-raised) shadow-(--mk-shadow) ${className}`}
    >
      {children}
    </div>
  )
}

/* ── People and status ─────────────────────────────────────────── */

export function Avatar({ name, tone }: { name: string; tone: number }) {
  return (
    <span
      className="grid size-[1.7em] shrink-0 place-items-center rounded-full text-[0.8em] text-white"
      style={{ background: toneColor(tone) }}
    >
      {name[0]}
    </span>
  )
}

const statusStyle: Record<string, string> = {
  Signed: "bg-(--mk-success-bg) text-(--mk-success)",
  Completed: "bg-(--mk-success-bg) text-(--mk-success)",
  Viewed: "bg-(--mk-info-bg) text-(--mk-info)",
  Sent: "bg-(--mk-info-bg) text-(--mk-info)",
  Draft: "bg-(--mk-muted) text-(--mk-text-2)",
  Waiting: "bg-(--mk-muted) text-(--mk-text-2)",
}

export function StatusPill({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-[0.6em] py-[0.1em] text-[0.7em] ${statusStyle[status] ?? statusStyle.Draft} ${className}`}
    >
      {status}
    </span>
  )
}

export function RecipientRow({
  r,
  order,
  detail,
  status = true,
}: {
  r: SampleRecipient
  order?: number
  detail?: ReactNode
  status?: boolean
}) {
  return (
    <div className="flex items-center gap-[0.6em] py-[0.35em] text-[0.8em]">
      {order !== undefined && (
        <span className="grid size-[1.5em] shrink-0 place-items-center rounded-full bg-(--mk-muted) text-[0.8em] text-(--mk-text-2)">
          {order}
        </span>
      )}
      <Avatar name={r.name} tone={r.tone} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{r.name}</span>
        <span className="block truncate text-[0.85em] text-(--mk-text-3)">{detail ?? r.role}</span>
      </span>
      {status && <StatusPill status={r.status} />}
    </div>
  )
}

/* ── Paper and fields ──────────────────────────────────────────── */

/** Grey bars standing in for body text on a page. */
export function TextLines({
  widths = [100, 96, 98, 72],
  className = "",
}: {
  widths?: number[]
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-[0.55em] ${className}`}>
      {widths.map((w, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
          key={i}
          className="h-[0.32em] rounded-full bg-(--mk-paper-line)"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  )
}

/** A white PDF page. Children are overlays positioned in % of the page. */
export function PdfPage({
  children,
  className = "",
  heading = true,
}: {
  children?: ReactNode
  className?: string
  heading?: boolean
}) {
  return (
    <div
      className={`relative aspect-[1/1.294] bg-(--mk-paper) p-[8%] text-(--mk-paper-ink) shadow-[0_0.2em_0.8em_rgb(0_0_0/0.12)] ${className}`}
    >
      {heading && (
        <>
          <p className="text-center text-[0.62em] font-semibold tracking-[0.06em]">
            MUTUAL NON-DISCLOSURE AGREEMENT
          </p>
          <TextLines widths={[100, 94, 98, 60]} className="mt-[1.2em]" />
          <TextLines widths={[100, 97, 91, 99, 40]} className="mt-[1em]" />
          <TextLines widths={[98, 100, 86]} className="mt-[1em]" />
        </>
      )}
      {children}
    </div>
  )
}

/** A handwritten-looking signature, drawn as a single stroke. */
export function Signature({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 40" className={className} fill="none" aria-hidden>
      <path
        d="M4 28c6-14 12-22 16-20s-6 22-2 23 10-20 15-19-2 15 2 15 8-12 12-11 0 9 4 9 9-9 14-9 3 7 8 6 10-8 14-8 6 4 11 3 9-5 14-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A placed field on a page. `at` is [left, top, width, height] in % of the page. */
export function FieldBox({
  tone,
  label,
  at,
  filled,
  selected = false,
}: {
  tone: number
  label: string
  at: [number, number, number, number]
  filled?: "signature" | string
  selected?: boolean
}) {
  const [left, top, width, height] = at
  const color = toneColor(tone)
  return (
    <div
      className="absolute flex items-center justify-center rounded-[0.25em] text-[0.55em]"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
        color: filled ? "var(--mk-paper-ink)" : color,
        border: filled ? "none" : `0.12em ${selected ? "solid" : "dashed"} ${color}`,
        background: filled ? "transparent" : `color-mix(in oklab, ${color} 12%, transparent)`,
      }}
    >
      {filled === "signature" ? (
        <Signature className="h-[85%] w-[90%] text-[#1e3a8a]" />
      ) : (
        <span className="truncate px-[0.3em]">{filled ?? label}</span>
      )}
      {selected &&
        [
          "-left-[0.3em] -top-[0.3em]",
          "-right-[0.3em] -top-[0.3em]",
          "-bottom-[0.3em] -left-[0.3em]",
          "-bottom-[0.3em] -right-[0.3em]",
        ].map((pos) => (
          <span
            key={pos}
            className={`absolute size-[0.6em] rounded-[0.1em] border bg-white ${pos}`}
            style={{ borderColor: color }}
          />
        ))}
    </div>
  )
}

/** A blank in the drafted text: dashed until filled, then a soft highlight. */
export function Blank({ children, filled = true }: { children: ReactNode; filled?: boolean }) {
  return (
    <span
      className={`rounded-[0.25em] px-[0.25em] ${
        filled
          ? "bg-[#eef2ff] text-[#3730a3]"
          : "border border-dashed border-[#a5b4fc] text-[#6366f1]"
      }`}
    >
      {children}
    </span>
  )
}

/* ── Evidence ──────────────────────────────────────────────────── */

export const shortHash = (h: string, n = 8) => `${h.slice(0, n)}…${h.slice(-n)}`

export function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-[0.8em] text-[0.62em]">
      <span className="w-[8.5em] shrink-0 opacity-60">{label}</span>
      <span className="truncate font-mono tracking-[-0.02em]">{shortHash(value, 12)}</span>
    </div>
  )
}

/** A deterministic QR-like grid with the three finder squares. Decorative. */
const QR_SIZE = 21
const qrCells = (() => {
  const cells: [number, number][] = []
  let seed = 0
  for (const ch of sample.code) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > QR_SIZE - 9 && y < 8) || (x < 8 && y > QR_SIZE - 9)
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      if (!inFinder(x, y) && (seed >>> 16) % 2 === 0) cells.push([x, y])
    }
  }
  return cells
})()

export function QrCode({ className = "" }: { className?: string }) {
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="currentColor" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="currentColor" />
    </g>
  )
  return (
    <svg viewBox={`-1 -1 ${QR_SIZE + 2} ${QR_SIZE + 2}`} className={className} aria-hidden>
      <rect x="-1" y="-1" width={QR_SIZE + 2} height={QR_SIZE + 2} fill="#fff" />
      {qrCells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
      {finder(0, 0)}
      {finder(QR_SIZE - 7, 0)}
      {finder(0, QR_SIZE - 7)}
    </svg>
  )
}

/* ── Assistant ─────────────────────────────────────────────────── */

export function ChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="ml-auto max-w-[85%] rounded-[0.9em] bg-(--mk-muted) px-[0.9em] py-[0.6em] text-[0.78em] leading-[1.4]">
      {children}
    </div>
  )
}

export function AssistantText({ children }: { children: ReactNode }) {
  return <p className="text-[0.78em] leading-[1.45] text-(--mk-text)">{children}</p>
}

/** The assistant's question card: a question, its choices, one picked. */
export function Question({
  q,
  options,
  picked,
}: {
  q: string
  options: string[]
  picked?: number
}) {
  return (
    <div className="flex flex-col gap-[0.5em]">
      <p className="text-[0.78em]">{q}</p>
      <div className="flex flex-wrap gap-[0.35em]">
        {options.map((o, i) => (
          <span
            key={o}
            className={`rounded-full border px-[0.7em] py-[0.15em] text-[0.7em] ${
              i === picked
                ? "border-(--mk-accent) bg-(--mk-accent) text-(--mk-on-accent)"
                : "border-(--mk-line) text-(--mk-text-2)"
            }`}
          >
            {o}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Composer({ placeholder = "Ask for a change…" }: { placeholder?: string }) {
  return (
    <div className="mt-auto flex items-center justify-between rounded-[0.9em] border border-(--mk-line) bg-(--mk-surface) px-[0.9em] py-[0.6em] text-[0.75em] text-(--mk-text-3)">
      <span>⌀ {placeholder}</span>
      <span className="grid size-[1.7em] place-items-center rounded-full bg-(--mk-accent) text-(--mk-on-accent)">
        ↑
      </span>
    </div>
  )
}

export function SettingRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[0.8em] border-b border-(--mk-line) py-[0.55em] text-[0.78em] last:border-b-0">
      <span className="text-(--mk-text-2)">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}
