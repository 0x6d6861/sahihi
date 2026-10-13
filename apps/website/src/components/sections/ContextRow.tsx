import type { CSSProperties, ReactNode } from "react"
import { Photo } from "@/components/mockups/parts"
import { Reveal } from "@/components/ui/Reveal"
import { Inset, Section } from "@/components/ui/Section"
import { sampleApp, site } from "@/content/site"

/** Four small cards whose contents drift past like marquees. */
export function ContextRow() {
  const [selection, designs, browser, code] = site.context.cards
  return (
    <Section className="pb-48">
      <Inset>
        <Reveal>
          <h2 className="text-lede px-3">{site.context.headline}</h2>
        </Reveal>
      </Inset>
      {/* Wider than the Inset column so four cards keep readable 20px captions. */}
      <div className="mx-auto mt-10 grid max-w-[1000px] grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        <ContextCard lead={selection.lead} text={selection.text}>
          <MarqueeX duration="30s">
            <ChipRows
              rows={[
                ["div.recipe-stats", "⧉ Larder redesign", "◍ localhost:3000"],
                ["◍ Larder — Home", "h1.launch-headline", "◇ Button"],
                ["◇ Chip", "▢ Year bar", "◍ Pricing"],
              ]}
            />
          </MarqueeX>
        </ContextCard>
        <ContextCard lead={designs.lead} text={designs.text}>
          <MarqueeX duration="36s">
            <div className="flex flex-col gap-2">
              {[0, 3].map((offset) => (
                <div key={offset} className="flex gap-2">
                  {sampleApp.items.slice(offset, offset + 3).map((it, i) => (
                    <div
                      key={it.title}
                      className="flex w-[150px] shrink-0 items-center gap-2 rounded-xl bg-white px-2 dark:bg-white/[0.08] py-1.5 text-[11px] leading-tight"
                    >
                      <Photo colors={it.photo} className="!aspect-square w-7 shrink-0 rounded" />
                      <span>
                        Card · {["Photo", "Type", "Overlay"][i]}
                        <br />
                        <span className="text-muted">Larder redesign</span>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </MarqueeX>
        </ContextCard>
        <ContextCard lead={browser.lead} text={browser.text}>
          <MarqueeY duration="18s">
            {[
              ["▶", "Start dev server", "localhost:3000"],
              ["▤", "View open tabs", "localhost:3000"],
              ["◎", "Screenshot tab", "localhost:3000"],
              ["⧉", "Capture tab", "localhost:3000"],
              ["◍", "Open URL", "example.com"],
              ["↓", "Fetch URL", "example.com"],
            ].map(([icon, verb, target]) => (
              <p key={verb} className="flex gap-2 whitespace-nowrap py-1 text-[12px]">
                <span className="text-muted">{icon}</span>
                {verb}
                <span className="text-faint">{target}</span>
              </p>
            ))}
          </MarqueeY>
        </ContextCard>
        <ContextCard lead={code.lead} text={code.text}>
          <MarqueeY duration="24s">
            <pre className="font-mono text-[10.5px] leading-[1.6] text-[#5b5b57] dark:text-[#a3a39e]">
              <span className="text-[#c2410c] dark:text-[#fb923c]">export function</span>{" "}
              RecipeCard({"{"} recipe {"}"}) {"{"}
              {"\n"} <span className="text-[#c2410c] dark:text-[#fb923c]">return</span> ({"\n"} &lt;
              <span className="text-[#1d4ed8] dark:text-[#93c5fd]">article</span>{" "}
              className=&quot;flex flex-col&quot;&gt;
              {"\n"} &lt;<span className="text-[#1d4ed8] dark:text-[#93c5fd]">img</span>{" "}
              className=&quot;aspect-[4/3]&quot; /&gt;
              {"\n"} &lt;<span className="text-[#1d4ed8] dark:text-[#93c5fd]">p</span>{" "}
              className=&quot;line-clamp-3&quot;&gt;
              {"\n"} {"{"}recipe.title{"}"}
              {"\n"} &lt;/<span className="text-[#1d4ed8] dark:text-[#93c5fd]">p</span>&gt;
              {"\n"} &lt;<span className="text-[#1d4ed8] dark:text-[#93c5fd]">Meta</span> {"{"}
              ...recipe{"}"} /&gt;
              {"\n"} &lt;/<span className="text-[#1d4ed8] dark:text-[#93c5fd]">article</span>&gt;
              {"\n"} );
              {"\n"}
              {"}"}
              {"\n"}
            </pre>
          </MarqueeY>
        </ContextCard>
      </div>
    </Section>
  )
}

function ContextCard({
  lead,
  text,
  children,
}: {
  lead: string
  text: string
  children: ReactNode
}) {
  return (
    <Reveal>
      <div className="h-[150px] overflow-hidden rounded-3xl bg-panel font-normal">{children}</div>
      <p className="text-caption mt-4 px-1 font-normal text-muted">
        <span className="font-medium text-ink">{lead}</span> {text}
      </p>
    </Reveal>
  )
}

function ChipRows({ rows }: { rows: string[][] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
        <div key={i} className="flex gap-2">
          {row.map((chip) => (
            <span
              key={chip}
              className="whitespace-nowrap rounded-full bg-white px-3 dark:bg-white/[0.08] py-1.5 text-[12px]"
            >
              {chip}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Content is rendered twice so the -50% loop is seamless. */
function MarqueeX({ children, duration }: { children: ReactNode; duration: string }) {
  return (
    <div className="fade-edges-x flex h-full items-center overflow-hidden">
      <div
        className="marquee-x flex w-max gap-2"
        style={{ "--marquee-duration": duration } as CSSProperties}
      >
        <div className="flex gap-2 pr-0">{children}</div>
        <div className="flex gap-2" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}

function MarqueeY({ children, duration }: { children: ReactNode; duration: string }) {
  return (
    <div className="fade-edges-y h-full overflow-hidden px-5">
      <div className="marquee-y" style={{ "--marquee-duration": duration } as CSSProperties}>
        <div className="py-2">{children}</div>
        <div className="py-2" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}
