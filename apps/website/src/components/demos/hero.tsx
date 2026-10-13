/**
 * Illustrative screens for the hero's three small frames: the idea of each step at a glance, not
 * the full app UI (that's the merged window and the chapters). Big shapes, few words, grey bars
 * for text. 1em = 4% of the frame's width, so they read at any size. Theme-aware via `--dm-*`.
 */
import type { CSSProperties, ReactNode } from "react"
import { Settle } from "@/components/ui/Settle"
import { s as settle } from "@/components/ui/settleMarks"
import { sample } from "@/content/site"
import { Icon, Scrawl, tone } from "./parts"

type Settled = ReturnType<typeof settle>

function Illustration({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="demo absolute inset-0 overflow-hidden bg-(--dm-muted)">
      {/* Each step settles once: the page lands, then what happens to it. */}
      <Settle className="illus-root">{children}</Settle>
    </div>
  )
}

/** A line of body text, drawn as a bar. */
function Bar({ w, className = "" }: { w: string; className?: string }) {
  return (
    <span
      className={`block h-[0.38em] rounded-full bg-(--dm-paper-ink)/12 ${className}`}
      style={{ width: w }}
    />
  )
}

function Sheet({
  children,
  className = "",
  style,
  at = settle(0),
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  at?: Settled
}) {
  return (
    <div
      data-s={at["data-s"]}
      className={`absolute rounded-[0.9em] bg-(--dm-paper) p-[1.4em] text-(--dm-paper-ink) shadow-[0_0.6em_1.8em_-0.6em_rgb(0_0_0/0.25)] ${className}`}
      style={{ ...at.style, ...style }}
    >
      {children}
    </div>
  )
}

/** Lands on the sheet after it: the step's outcome. */
function Floating({
  children,
  className = "",
  at = settle(0, 220),
}: {
  children: ReactNode
  className?: string
  at?: Settled
}) {
  return (
    <div
      {...at}
      className={`absolute rounded-[1.1em] border border-(--dm-line) bg-(--dm-card) p-[1em] shadow-(--dm-shadow) ${className}`}
    >
      {children}
    </div>
  )
}

/* ── Draft: a sheet whose blanks fill in, and the assistant's question ── */

export function HeroDraft() {
  // Filled blanks fade in after the page lands, as if the assistant just wrote them.
  const blank = (filled: boolean, w: string) => (
    <span
      {...(filled ? settle(0, 520, "fade") : {})}
      className={`inline-block h-[1.05em] rounded-[0.35em] align-middle ${
        filled ? "" : "border border-dashed border-(--dm-warn) bg-(--dm-warn-bg)"
      }`}
      style={{
        ...(filled ? settle(0, 520, "fade").style : {}),
        width: w,
        background: filled ? "color-mix(in oklab, var(--dm-tone-0) 18%, white)" : undefined,
      }}
    />
  )
  return (
    <Illustration>
      <Sheet className="top-[8%] left-[7%] w-[66%]">
        <p className="text-[0.95em] font-semibold leading-[1.2]">Mutual NDA</p>
        <div className="mt-[0.9em] flex flex-col gap-[0.6em]">
          <span className="flex items-center gap-[0.4em]">
            <Bar w="30%" /> {blank(false, "34%")}
          </span>
          <span className="flex items-center gap-[0.4em]">
            {blank(true, "42%")} <Bar w="40%" />
          </span>
          <Bar w="92%" />
          <span className="flex items-center gap-[0.4em]">
            <Bar w="22%" /> {blank(true, "56%")}
          </span>
          <Bar w="80%" />
          <Bar w="88%" />
          <Bar w="54%" />
        </div>
      </Sheet>
      <Floating className="right-[6%] bottom-[8%] w-[58%]">
        <span className="flex items-center gap-[0.4em] text-[0.7em] text-(--dm-text-3)">
          <Icon name="sparkles" /> Assistant
        </span>
        <p className="mt-[0.4em] text-[0.82em] leading-[1.3]">How long should it run?</p>
        <div className="mt-[0.6em] flex flex-col gap-[0.35em]">
          {sample.question.options.map((o, i) => (
            <span
              key={o}
              {...settle(i, 380)}
              className={`flex items-center rounded-full border px-[0.7em] py-[0.3em] text-[0.72em] ${
                i === 1
                  ? "border-transparent bg-(--dm-accent) text-(--dm-on-accent)"
                  : "border-(--dm-strong)"
              }`}
            >
              {o}
              {i === 1 && <Icon name="check" className="ml-auto" />}
            </span>
          ))}
        </div>
      </Floating>
    </Illustration>
  )
}

/* ── Send: a page with each signer's field, and one link each ── */

export function HeroSend() {
  return (
    <Illustration>
      <Sheet className="top-[9%] left-1/2 w-[66%] -translate-x-1/2 pb-[3.2em]">
        <Bar w="56%" className="h-[0.55em]" />
        <div className="mt-[0.9em] flex flex-col gap-[0.6em]">
          <Bar w="100%" />
          <Bar w="92%" />
          <Bar w="96%" />
          <Bar w="64%" />
          <Bar w="88%" className="mt-[0.4em]" />
          <Bar w="96%" />
          <Bar w="42%" />
        </div>
        <div className="mt-[1.4em] grid grid-cols-2 gap-[0.8em]">
          {[0, 1].map((i) => (
            <div key={i} {...settle(i, 200)}>
              <div
                className="flex h-[2.6em] items-center justify-center rounded-[0.5em] border-[0.12em] text-[0.7em]"
                style={{
                  borderColor: tone(i),
                  borderStyle: i ? "dashed" : "solid",
                  background: `color-mix(in oklab, ${tone(i)} 10%, white)`,
                  color: tone(i),
                }}
              >
                {i ? "Sign here" : <Scrawl className="h-[80%] w-[85%] text-[#1e3a8a]" />}
              </div>
              <Bar w="70%" className="mt-[0.5em]" />
            </div>
          ))}
        </div>
      </Sheet>
      <Floating
        at={settle(0, 420)}
        className="right-[6%] bottom-[9%] flex items-center gap-[0.6em] rounded-full px-[0.9em] py-[0.6em]"
      >
        <span className="flex -space-x-[0.4em]">
          {sample.signers.map((s, i) => (
            <span
              key={s.name}
              className="grid size-[1.6em] place-items-center rounded-full border-[0.12em] border-(--dm-card) text-[0.62em] text-white"
              style={{ background: tone(i) }}
            >
              {s.name[0]}
            </span>
          ))}
        </span>
        <span className="text-[0.72em]">2 signing links</span>
        <span className="grid size-[1.7em] place-items-center rounded-full bg-(--dm-accent) text-(--dm-on-accent)">
          <Icon name="send" className="text-[0.8em]" />
        </span>
      </Floating>
    </Illustration>
  )
}

/* ── Prove: the certificate, sealed, with its fingerprint and code ── */

const QR = 13
const qrCells = (() => {
  const cells: [number, number][] = []
  let seed = 7
  const finder = (x: number, y: number) =>
    (x < 4 && y < 4) || (x > QR - 5 && y < 4) || (x < 4 && y > QR - 5)
  for (let y = 0; y < QR; y++) {
    for (let x = 0; x < QR; x++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      if (!finder(x, y) && (seed >>> 16) % 2 === 0) cells.push([x, y])
    }
  }
  return cells
})()

function Qr() {
  const eye = (x: number, y: number) => (
    <g key={`${x}${y}`}>
      <rect x={x} y={y} width="4" height="4" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <rect x={x + 1.3} y={y + 1.3} width="1.4" height="1.4" fill="currentColor" />
    </g>
  )
  return (
    <svg viewBox={`-0.5 -0.5 ${QR + 1} ${QR + 1}`} className="size-[3.4em]" aria-hidden>
      {qrCells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
      {eye(0, 0)}
      {eye(QR - 4, 0)}
      {eye(0, QR - 4)}
    </svg>
  )
}

export function HeroProve() {
  const hash = sample.signedSha256
  return (
    <Illustration>
      <Sheet className="top-[8%] left-1/2 w-[76%] -translate-x-1/2 pb-[3.4em]">
        <div className="flex items-start gap-[0.8em]">
          <div className="min-w-0 flex-1">
            <p className="text-[0.62em] tracking-[0.14em] text-(--dm-paper-ink)/50">SAHIHI</p>
            <p className="mt-[0.15em] text-[0.95em] leading-[1.2] font-semibold">
              Certificate of Completion
            </p>
            <Bar w="70%" className="mt-[0.6em]" />
          </div>
          <Qr />
        </div>
        <div className="mt-[1em] rounded-[0.6em] bg-(--dm-paper-ink)/5 px-[0.7em] py-[0.5em] font-mono text-[0.62em]">
          SHA-256 {hash.slice(0, 6)}…{hash.slice(-6)}
        </div>
        <div className="mt-[0.9em] flex flex-col gap-[0.55em]">
          {sample.signers.map((s, i) => (
            <span
              key={s.name}
              {...settle(i, 260)}
              className="flex items-center gap-[0.5em] text-[0.7em]"
            >
              <span className="grid size-[1.3em] place-items-center rounded-full bg-[#dcfce7] text-[#15803d]">
                <Icon name="check" className="text-[0.75em]" />
              </span>
              {s.name}
              <Bar w="22%" className="ml-auto" />
            </span>
          ))}
        </div>
        <div className="mt-[1em] flex flex-col gap-[0.5em] border-t border-(--dm-paper-ink)/10 pt-[0.8em]">
          {["86%", "74%", "90%", "62%"].map((w) => (
            <span key={w} className="flex items-center gap-[0.6em]">
              <Bar w="18%" />
              <Bar w={w} />
            </span>
          ))}
        </div>
      </Sheet>
      <Floating
        at={settle(0, 480, "drop")}
        className="right-[7%] bottom-[9%] flex items-center gap-[0.5em] rounded-full px-[0.9em] py-[0.5em]"
      >
        <span className="grid size-[1.6em] place-items-center rounded-full bg-(--dm-success-bg) text-(--dm-success)">
          <Icon name="seal" className="text-[0.9em]" />
        </span>
        <span className="text-[0.75em]">Verified</span>
        <span className="font-mono text-[0.62em] text-(--dm-text-2)">{sample.certificate}</span>
      </Floating>
    </Illustration>
  )
}
