/**
 * Building blocks for the product mockups. Everything is sized in `em`,
 * and the root font-size scales with the frame (see `.mockup-root` in globals.css),
 * so a mockup reads correctly at any width.
 */
import type { CSSProperties, ReactNode } from "react"
import { type SampleItem, sampleApp } from "@/content/site"

const categoryColor = (name: string) =>
  sampleApp.categories.find((c) => c.name === name)?.color ?? "#7b7b74"

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
      className={`mockup-root h-full w-full text-ink ${className}`}
      style={scale ? ({ "--mk": scale } as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}

/* ── Sample-app pieces ─────────────────────────────────────────── */

/** A "food photo" made of gradients — a plate on a table. No image assets needed. */
export function Photo({
  colors,
  className = "",
}: {
  colors: readonly string[]
  className?: string
}) {
  const [plate, rim, table] = colors
  return (
    <div
      className={`aspect-[4/3] w-full ${className}`}
      style={{
        background: `radial-gradient(circle at 48% 54%, ${plate} 0 26%, ${rim} 27% 33%, #f4f1ea 34% 39%, transparent 40%), radial-gradient(circle at 30% 20%, rgb(255 255 255 / 0.25), transparent 50%), linear-gradient(155deg, ${table}, color-mix(in oklab, ${table} 70%, black))`,
      }}
    />
  )
}

export function MetaRow({ category, date }: { category: string; date: string }) {
  return (
    <div className="flex items-center gap-[0.4em] text-[0.75em] text-[#77756f]">
      <span
        className="size-[0.55em] rounded-full"
        style={{ background: categoryColor(category) }}
      />
      {category}
      <span className="ml-auto">{date}</span>
    </div>
  )
}

export function SampleCard({
  item,
  variant = "photo",
  selected = false,
  className = "",
}: {
  item: SampleItem
  variant?: "photo" | "type" | "overlay" | "night" | "label" | "split"
  selected?: boolean
  className?: string
}) {
  const ring = selected ? "outline outline-[0.15em] outline-select" : ""

  if (variant === "type") {
    return (
      <div className={`flex flex-col gap-[0.8em] bg-[#fbfaf6] p-[0.9em] ${ring} ${className}`}>
        <p className="text-[1.25em] leading-[1.15] tracking-[-0.02em]">{item.title}</p>
        <Photo colors={item.photo} className="!aspect-square w-[30%]" />
        <MetaRow category={item.category} date={item.date} />
      </div>
    )
  }
  if (variant === "overlay" || variant === "night") {
    return (
      <div
        className={`relative ${variant === "night" ? "bg-[#151515] p-[0.4em]" : ""} ${ring} ${className}`}
      >
        <Photo colors={item.photo} className="!aspect-square" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-[0.8em] pt-[2em] text-white">
          <p className="text-[0.8em] leading-tight">{item.title}</p>
        </div>
      </div>
    )
  }
  if (variant === "label") {
    return (
      <div className={`flex gap-[0.8em] bg-[#fbfaf6] p-[0.8em] ${ring} ${className}`}>
        <Photo colors={item.photo} className="!aspect-square w-[38%] shrink-0" />
        <div className="flex min-w-0 flex-col gap-[0.25em] text-[0.8em]">
          <span className="text-[#9a978f]">No. 038</span>
          <span className="text-[1.25em] leading-tight tracking-[-0.02em]">
            {item.title.split(".")[0]}
          </span>
          <span className="mt-auto text-[#77756f]">
            {item.category} · {item.date}
          </span>
        </div>
      </div>
    )
  }
  if (variant === "split") {
    return (
      <div
        className={`grid grid-cols-[2fr_1fr] gap-[0.3em] bg-[#fbfaf6] p-[0.5em] ${ring} ${className}`}
      >
        <Photo colors={item.photo} className="!aspect-auto h-full" />
        <div className="grid gap-[0.3em]">
          <Photo colors={item.photo} />
          <Photo colors={[...item.photo].reverse()} />
        </div>
        <p className="col-span-2 pt-[0.4em] text-[0.8em] leading-tight">{item.title}</p>
      </div>
    )
  }
  return (
    <div className={`flex flex-col bg-[#fbfaf6] ${ring} ${className}`}>
      <div className="p-[0.6em] pb-0">
        <Photo colors={item.photo} />
      </div>
      <div className="flex flex-col gap-[0.6em] p-[0.8em]">
        <p className="line-clamp-3 text-[0.85em] leading-[1.3]">{item.title}</p>
        <MetaRow category={item.category} date={item.date} />
      </div>
    </div>
  )
}

export function AppLogo() {
  return (
    <div className="flex items-center gap-[0.5em] text-[0.85em]">
      <span className="flex items-center gap-[0.2em]">
        <span className="size-[0.7em] rounded-full bg-[#d9482b]" />
        <span className="size-0 border-x-[0.38em] border-b-[0.7em] border-x-transparent border-b-[#f3c13a]" />
        <span className="size-[0.7em] bg-[#2f5bd3]" />
      </span>
      {sampleApp.name}
    </div>
  )
}

export function BarChart({ highlight = 14 }: { highlight?: number }) {
  const bars = [3, 5, 2, 4, 1, 6, 3, 8, 11, 4, 2, 5, 9, 12, 7, 3, 6, 10, 4, 2]
  return (
    <div className="flex h-[4.5em] items-end gap-[0.45em] border-b border-black/15 pb-[0.2em]">
      {bars.map((h, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
          key={i}
          className="w-[0.22em] rounded-full"
          style={{ height: `${h * 8}%`, background: i === highlight ? "#2f5bd3" : "#9d9a92" }}
        />
      ))}
    </div>
  )
}

export function FilterChips() {
  return (
    <div className="flex items-center gap-[0.9em] text-[0.75em]">
      <span className="rounded-full bg-[#f6f4ee] px-[0.6em] py-[0.15em]">All</span>
      {sampleApp.categories.map((c) => (
        <span key={c.name} className="flex items-center gap-[0.35em]">
          <span className="size-[0.5em] rounded-full" style={{ background: c.color }} />
          {c.name}
        </span>
      ))}
    </div>
  )
}

/** The sample app's main page. */
export function AppPage({
  cards = 3,
  chart = false,
  selected,
  className = "",
}: {
  cards?: number
  chart?: boolean
  selected?: number
  className?: string
}) {
  return (
    <div className={`flex h-full flex-col gap-[1.4em] bg-[#dddad2] p-[1.6em] ${className}`}>
      <div className="flex items-center justify-between">
        <AppLogo />
        <span className="flex flex-col gap-[0.18em]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[0.1em] w-[0.9em] bg-ink" />
          ))}
        </span>
      </div>
      <div>
        <p className="text-[3.4em] leading-none tracking-[-0.05em]">{sampleApp.heading}</p>
        <p className="mt-[0.5em] text-[0.8em] text-[#6f6d66]">{sampleApp.meta}</p>
      </div>
      {chart && (
        <div className="flex flex-col gap-[0.8em]">
          <BarChart />
          <FilterChips />
        </div>
      )}
      <div className="grid grid-cols-3 gap-[1em]">
        {sampleApp.items.slice(0, cards).map((item, i) => (
          <SampleCard key={item.title} item={item} selected={selected === i} />
        ))}
      </div>
    </div>
  )
}

/* ── Window chrome ─────────────────────────────────────────────── */

export function TrafficLights() {
  return (
    <span className="flex gap-[0.45em]">
      <span className="size-[0.8em] rounded-full bg-[#fe5f57]" />
      <span className="size-[0.8em] rounded-full bg-[#febc2e]" />
      <span className="size-[0.8em] rounded-full bg-[#28c840]" />
    </span>
  )
}

export function TabBar({
  tabs,
  active = 0,
  agent = true,
}: {
  tabs: { icon?: "globe" | "canvas"; label: string }[]
  active?: number
  agent?: boolean
}) {
  return (
    <div className="flex h-[2.6em] shrink-0 items-center gap-[0.8em] bg-[#e7e7e5] px-[0.9em] text-[0.8em]">
      <TrafficLights />
      <span className="text-[#9b9b97]">◧ ← →</span>
      <div className="flex min-w-0 items-center gap-[0.3em]">
        {tabs.map((t, i) => (
          <span
            key={t.label}
            className={`flex items-center gap-[0.4em] truncate rounded-[0.5em] px-[0.8em] py-[0.3em] ${
              i === active ? "bg-white/90" : "text-[#6f6f6b]"
            }`}
          >
            <span className="text-[0.9em]">{t.icon === "canvas" ? "⧉" : "◍"}</span>
            {t.label}
          </span>
        ))}
        <span className="text-[#9b9b97]">+</span>
      </div>
      {agent && (
        <span className="ml-auto flex items-center gap-[0.4em] rounded-full bg-white/80 px-[0.7em] py-[0.25em]">
          <span className="size-[0.8em] rounded-full bg-[conic-gradient(#f97316,#a855f7,#22c55e,#f97316)]" />
          Agent
        </span>
      )}
    </div>
  )
}

export function UrlBar({ url }: { url: string }) {
  return (
    <div className="flex h-[2.2em] shrink-0 items-center gap-[0.8em] border-b border-black/5 bg-[#f7f7f6] px-[0.9em] text-[0.75em] text-[#77777a]">
      <span>‹ › ↻</span>
      <span className="mx-auto">{url}</span>
      <span>⋯</span>
    </div>
  )
}

/** Floating tool pill at the bottom of canvas views. */
export function Toolbar({ active = 0 }: { active?: number }) {
  const tools = ["➤", "+", "◯", "⌕"]
  return (
    <div className="absolute bottom-[0.9em] left-1/2 flex -translate-x-1/2 items-center gap-[0.3em] rounded-full bg-white/90 p-[0.25em] text-[0.75em] text-[#55554f] shadow-[0_0.1em_0.4em_rgb(0_0_0/0.08)]">
      {tools.map((t, i) => (
        <span
          key={t}
          className={`grid size-[1.8em] place-items-center rounded-full ${i === active ? "bg-[#ececea] text-ink" : ""}`}
        >
          {t}
        </span>
      ))}
    </div>
  )
}

export function PanelLabel({ children }: { children: ReactNode }) {
  return <p className="text-[0.75em] text-[#9b9b97]">{children}</p>
}

export function LayersPanel({
  page,
  layers,
  selected,
  className = "",
}: {
  page: string
  layers: { label: string; depth?: number; kind?: "frame" | "text" | "comp" | "img" }[]
  selected?: number
  className?: string
}) {
  const glyph = { frame: "▢", text: "T", comp: "◇", img: "▨" } as const
  return (
    <div className={`flex flex-col gap-[0.9em] rounded-[0.7em] bg-white/90 p-[0.9em] ${className}`}>
      <div>
        <PanelLabel>Pages</PanelLabel>
        <p className="mt-[0.3em] flex justify-between text-[0.85em]">
          {page} <span className="text-[#9b9b97]">⋯</span>
        </p>
      </div>
      <div className="flex flex-col gap-[0.15em]">
        <PanelLabel>Layers</PanelLabel>
        {layers.map((l, i) => (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
            key={`${l.label}-${i}`}
            className={`flex items-center gap-[0.5em] truncate rounded-[0.4em] py-[0.25em] text-[0.78em] ${
              i === selected ? "bg-[#dfe9fb]" : ""
            }`}
            style={{ paddingLeft: `${0.4 + (l.depth ?? 0) * 1}em` }}
          >
            <span className="text-[0.85em] text-[#8f8f8a]">{glyph[l.kind ?? "frame"]}</span>
            {l.label}
          </p>
        ))}
      </div>
    </div>
  )
}

export function ChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="ml-auto max-w-[85%] rounded-[0.8em] bg-[#ececea] px-[0.9em] py-[0.6em] text-[0.8em] leading-[1.35]">
      {children}
    </div>
  )
}

export function ToolStep({ verb, detail }: { verb: string; detail: string }) {
  return (
    <p className="flex items-center gap-[0.5em] truncate text-[0.75em]">
      <span className="text-[#9b9b97]">›</span>
      <span>{verb}</span>
      <span className="truncate text-[#8f8f8a]">{detail}</span>
      <span className="ml-auto text-[#b5b5b0]">⌄</span>
    </p>
  )
}

export function Composer({ branch = "main", diff }: { branch?: string; diff?: [number, number] }) {
  return (
    <div className="mt-auto flex flex-col">
      <div className="flex justify-between rounded-t-[0.6em] bg-[#e9e9e7] px-[0.8em] py-[0.3em] text-[0.65em] text-[#8f8f8a]">
        <span>
          larder-app · <span className="text-ink/70">{branch}</span>
        </span>
        {diff && (
          <span>
            <span className="text-[#16a34a]">+{diff[0]}</span>{" "}
            <span className="text-[#dc2626]">-{diff[1]}</span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-[1em] rounded-[0.6em] bg-[#f1f1ef] p-[0.8em] text-[0.75em] text-[#9b9b97]">
        Send a message…
        <div className="flex items-center justify-between">
          <span>▣</span>
          <span className="flex items-center gap-[0.5em] text-ink/80">
            <span className="text-[#e46b3a]">✺</span> Large
            <span className="grid size-[1.6em] place-items-center rounded-full bg-[#dcdcd9]">
              ↑
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

export function AgentPanel({
  title,
  children,
  branch,
  diff,
  className = "",
}: {
  title: string
  children: ReactNode
  branch?: string
  diff?: [number, number]
  className?: string
}) {
  return (
    <div className={`flex h-full flex-col gap-[0.9em] bg-white p-[0.9em] ${className}`}>
      <div className="flex items-center justify-between text-[0.78em]">
        <span>≡ {title} ⌄</span>
        <span className="text-[#9b9b97]">✎ ✕</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[0.7em] overflow-hidden">{children}</div>
      <Composer branch={branch} diff={diff} />
    </div>
  )
}

export function InspectorRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-[0.6em] text-[0.75em]">
      <span className="w-[5.5em] shrink-0 text-[#8f8f8a]">{label}</span>
      <span className="flex-1 truncate rounded-[0.4em] bg-[#f3f3f1] px-[0.6em] py-[0.25em]">
        {value}
      </span>
    </div>
  )
}
